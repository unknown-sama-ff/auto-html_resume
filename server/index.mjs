import 'dotenv/config';
import { buildGenerationMessages, parseGeneration } from './generation.mjs';
import { getPresetDefinitions, publicPreset } from './presets.mjs';
import { buildEditMessages, parseEditPatch } from '../shared/edit.ts';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 8787);
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(rootDir, '..', 'dist');
const rateWindowMs = 60_000;
const maxRequestsPerWindow = Number(process.env.AI_RATE_LIMIT || 12);
const requestLog = new Map();

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787').split(',').map((value) => value.trim()).filter(Boolean);
const corsOptions = { origin: (origin, callback) => { if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin not allowed')); } };
app.use((request, response, next) => request.path.startsWith('/api') ? cors(corsOptions)(request, response, next) : next());
app.use(express.json({ limit: '8mb' }));

function normalizeCompletionUrl(input) {
  const url = new URL(input);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('AI URL 只支持 http 或 https');
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/chat/completions')) url.pathname = `${pathname}/chat/completions`;
  return url;
}

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 0;
  }
  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
  }
  return true;
}

async function assertSafeDestination(url) {
  const privateAllowed = process.env.ALLOW_PRIVATE_AI_URLS === 'true';
  const allowedHosts = new Set((process.env.ALLOWED_AI_HOSTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
  for (const preset of getPresetDefinitions()) allowedHosts.add(new URL(preset.baseUrl).hostname.toLowerCase());
  const hostname = url.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) throw new Error(`自定义模型域名未被允许：${hostname}。请在 Railway 配置 ALLOWED_AI_HOSTS。`);
  if (privateAllowed) return;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || net.isIP(hostname) && isPrivateIp(hostname)) throw new Error('为安全起见，生产模式禁止访问本地或私网 AI 地址');
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) throw new Error('AI 域名解析到了本地或私网地址，已拒绝请求');
}

function assertRateLimit(request) {
  const key = request.ip || request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((timestamp) => now - timestamp < rateWindowMs);
  if (recent.length >= maxRequestsPerWindow) throw new Error('AI 请求过于频繁，请稍后再试');
  recent.push(now);
  requestLog.set(key, recent);
}

function resolveProviderConfig(config = {}) {
  if(config.mode==='custom')throw new Error('自定义URL由浏览器直连，后端不代理用户自定义通道。');
  const definitions = getPresetDefinitions();
  const preset = definitions.find((item) => item.id === config.presetId);
  if (!preset) throw new Error('没有可用的后端模型预设');
  const apiKey = process.env[preset.keyEnv] || '';
  if (!apiKey) throw new Error(`Railway 尚未配置 ${preset.keyEnv}`);
  return { url: normalizeCompletionUrl(preset.baseUrl), model: preset.model, apiKey };
}

async function requestModel(config, messages) {
  const provider = resolveProviderConfig(config);
  await assertSafeDestination(provider.url);
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const signal = AbortSignal.timeout(90_000);
  const upstream = await fetch(provider.url, { method: 'POST', headers, redirect: 'manual', signal, body: JSON.stringify({ model: provider.model, messages }) });
  if(upstream.status>=300 && upstream.status<400) throw new Error('模型接口重定向已被拒绝，请填写直接调用地址。');
  if(!upstream.ok) {
    // Never echo an upstream body that could contain API keys or private request data.
    if(upstream.status===401 || upstream.status===403) throw new Error('模型鉴权失败，请检查后端Key或自定义Key。');
    if(upstream.status===429) throw new Error('模型通道限流或额度不足，请稍后重试。');
    throw new Error(`模型接口返回${upstream.status}，请检查URL、模型名称和图片能力。`);
  }
  const raw = await upstream.text();
  if(raw.length>1000000) throw new Error('模型返回内容过大，请精简资料后重试。');
  const payload=JSON.parse(raw); const content=payload?.choices?.[0]?.message?.content;
  if(typeof content!=='string' || !content.trim()) throw new Error('模型没有返回有效文本。');
  return content;
}
function sendFailure(response,error) {
  if(error?.name==='ZodError') return response.status(400).json({error:'输入材料格式不正确或超过限制，请检查后重试。'});
  if(error?.name==='TimeoutError' || error?.name==='AbortError') return response.status(504).json({error:'模型请求超时，资料已保留，请重试。'});
  const message=error instanceof Error ? error.message : '模型请求失败';
  const status= /尚未配置|请输入|未被允许|私网|本地|频繁|没有可用|浏览器直连/.test(message) ? 400 : 502;
  return response.status(status).json({error:message});
}
app.get('/api/health', (_request,response)=>response.json({ok:true,service:'folio-atelier'}));
app.get('/api/ai/presets', (_request,response)=>response.json(getPresetDefinitions().map(publicPreset)));
app.post('/api/ai/generate', async (request,response)=>{
  try { assertRateLimit(request); const messages=buildGenerationMessages(request.body); const content=await requestModel(request.body.config,messages); return response.json(parseGeneration(content)); }
  catch(error){return sendFailure(response,error);}
});
app.post('/api/ai/edit', async (request,response)=>{
  try {
    assertRateLimit(request); const body=request.body;
    if(typeof body?.prompt!=='string' || !body.prompt.trim() || body.prompt.length>8000 || typeof body.selection?.id!=='string') return response.status(400).json({error:'请输入修改指令并选择简历元素。'});
    const content=await requestModel(body.config,buildEditMessages(body.prompt,body.selection));
    return response.json({patch:parseEditPatch(content,body.selection.id)});
  } catch(error){return sendFailure(response,error);}
});
app.use((error,_request,response,_next)=>response.status(error.type==='entity.too.large'?413:400).json({error:error.type==='entity.too.large'?'资料过大，请减少文件大小。':'请求无效，请检查材料与网站来源。'}));

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(path.join(distDir, 'index.html')));
}

app.listen(port, () => console.log(`folio-atelier server listening on ${port}`));


