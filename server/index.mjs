import 'dotenv/config';
import { buildGenerationMessages, parseGeneration } from './generation.mjs';
import { getPresetDefinitions, publicPreset } from './presets.mjs';
import { buildEditMessages, parseEditPatch } from '../shared/edit.ts';
import { resolveModelEndpoint, buildModelRequest, extractModelText, describeBadRequest, parseReasoningEffort } from '../shared/modelProtocol.ts';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseAiTimeoutMs } from '../shared/requestTimeout.ts';
import { appVersion, DIAGNOSTICS_VERSION, requestDiagnostics, logAiFailure } from './diagnostics.mjs';

const app = express();
const port = Number(process.env.PORT || 8787);
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(rootDir, '..', 'dist');
const rateWindowMs = 60_000;
const maxRequestsPerWindow = Number(process.env.AI_RATE_LIMIT || 12);
const requestLog = new Map();

app.use((request,response,next)=>{
  if(request.path.startsWith('/api')){
    response.setHeader('Cache-Control','no-store');
    const requestId=randomUUID();response.setHeader('X-App-Request-Id',requestId);
    response.locals.aiDiagnostics={requestId,details:{version:appVersion}};
  }
  next();
});

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787').split(',').map((value) => value.trim()).filter(Boolean);
const corsOptions = { origin: (origin, callback) => { if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin not allowed')); } };
app.use((request, response, next) => request.path.startsWith('/api') ? cors(corsOptions)(request, response, next) : next());
app.use(express.json({ limit: '8mb' }));

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
  const apiKey = (process.env[preset.keyEnv] || '').trim();
  if (!apiKey) throw new Error(`Railway 尚未配置 ${preset.keyEnv}`);
  if (/^(REPLACE_WITH_|YOUR_|请|你的|在Railway)/i.test(apiKey) || apiKey === '...') throw new Error(`${preset.keyEnv} 仍是示例占位值，请在 Railway 填入真实令牌并重新部署。`);
  if (/\s/.test(apiKey) || /^Bearer\b/i.test(apiKey) || /['"]/.test(apiKey)) throw new Error(`${preset.keyEnv} 格式不正确：只填写令牌本身，不要包含 Bearer、引号或中间空格。`);
  return { ...resolveModelEndpoint(preset.baseUrl, preset.protocol), model: preset.model, reasoningEffort: parseReasoningEffort(preset.reasoningEffort), apiKey };
}

async function requestModel(config, messages, context) {
  const provider = resolveProviderConfig(config);
  const timeoutMs = parseAiTimeoutMs(process.env.AI_REQUEST_TIMEOUT_MS);
  const started = performance.now();
  let phase = 'checking_destination';
  if(context)context.details={...requestDiagnostics(provider,messages),timeoutMs,phase};
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    await assertSafeDestination(provider.url);
    signal.throwIfAborted();
    const headers = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
    phase = 'waiting_response';
    const upstream = await fetch(provider.url, { method: 'POST', headers, redirect: 'manual', signal, body: JSON.stringify(buildModelRequest(provider.model, messages, provider.protocol, provider.reasoningEffort)) });
    phase = 'reading_response';
    if(upstream.status>=300 && upstream.status<400) throw new Error('模型接口重定向已被拒绝，请填写直接调用地址。');
    if(!upstream.ok) {
      // Never echo an upstream body that could contain API keys or private request data.
      if(upstream.status===401) throw Object.assign(new Error('作者预设认证失败（上游 HTTP 401）。请确认 Railway 的 CF_API_KEY 为有效令牌，并在保存变量后重新部署。'), { upstreamStatus:401 });
      if(upstream.status===403) throw Object.assign(new Error('作者预设访问被拒绝（上游 HTTP 403）。请检查令牌分组、模型调用权限、IP 限制或通道网关规则。'), { upstreamStatus:403 });
      if(upstream.status===400) {
        const body = await upstream.text();
        let payload = null;
        if(body.length <= 64000) { try { payload = JSON.parse(body); } catch { /* Ignore arbitrary upstream error content. */ } }
        const detail = describeBadRequest(payload);
        throw Object.assign(new Error(`作者预设请求被拒绝（上游 HTTP 400）。${detail.hint}`), { upstreamStatus:400, ...detail });
      }
      if(upstream.status===408||upstream.status===504) throw Object.assign(new Error(`AI通道自身返回 HTTP ${upstream.status} 超时。延长工具等待上限不能延长中转自身的限制；资料已保留，请向通道核对排队和响应时间。`),{upstreamStatus:upstream.status,diagnostic:'upstream_timeout'});
      if(upstream.status===429) throw new Error('模型通道限流或额度不足，请稍后重试。');
      throw new Error(`模型接口返回${upstream.status}，请检查URL、模型名称和图片能力。`);
    }
    const raw = await upstream.text();
    signal.throwIfAborted();
    phase = 'parsing_response';
    if(raw.length>1000000) throw new Error('模型返回内容过大，请精简资料后重试。');
    let payload;
    try { payload=JSON.parse(raw); } catch { throw new Error('模型返回的不是非流式JSON，请核对接口协议和流式要求。'); }
    return extractModelText(payload, provider.protocol);
  } catch(error) {
    if(signal.aborted && (error?.name==='TimeoutError'||error?.name==='AbortError')) {
      throw Object.assign(new Error(`模型请求达到 ${Math.round(timeoutMs/1000)} 秒等待上限，资料已保留。请降低推理强度、缩短资料，或检查中转排队；不会自动重试。`),{name:'TimeoutError',diagnostic:'request_timeout'});
    }
    throw error;
  } finally {
    if(context)Object.assign(context.details,{timeoutMs,elapsedMs:Math.round(performance.now()-started),phase});
  }
}

function sendFailure(response,error) {
  let status=502;
  let message=error instanceof Error?error.message:'模型请求失败';
  if(error?.name==='ZodError'){status=400;message='输入材料格式不正确或超过限制，请检查后重试。';}
  else if(error?.diagnostic==='upstream_timeout'){status=504;}
  else if(error?.name==='TimeoutError'||error?.name==='AbortError'){status=504;message=error.diagnostic==='request_timeout'?error.message:'模型请求超时，资料已保留，请重试。';}
  else if(error?.name==='SyntaxError')message='模型返回内容不是有效JSON，请核对接口协议后重试。';
  else if(![400,401,403].includes(error?.upstreamStatus))status=/尚未配置|请输入|未被允许|私网|本地|频繁|没有可用|浏览器直连|CF_API_KEY|CF_API_PROTOCOL|CF_API_REASONING_EFFORT|AI_REQUEST_TIMEOUT_MS/.test(message)?400:502;
  const context=response.locals.aiDiagnostics;
  const extra={
    ...(context?{requestId:context.requestId,diagnostics:context.details}:{}),
    ...([400,401,403,408,504].includes(error?.upstreamStatus)?{upstreamStatus:error.upstreamStatus}:{}),
    ...(error?.diagnostic?{diagnostic:error.diagnostic}:{}),
    ...(error?.upstreamCode?{upstreamCode:error.upstreamCode}:{}),
    ...(error?.upstreamParam?{upstreamParam:error.upstreamParam}:{}),
  };
  if(context)logAiFailure(context,status,error);
  return response.status(status).json({error:message,...extra});
}
app.get('/api/health', (_request,response)=>response.json({ok:true,service:'folio-atelier',version:appVersion,diagnosticsVersion:DIAGNOSTICS_VERSION}));
app.get('/api/ai/presets', (_request,response)=>response.json(getPresetDefinitions().map(publicPreset)));
app.post('/api/ai/generate', async (request,response)=>{
  try { assertRateLimit(request); const messages=buildGenerationMessages(request.body); const content=await requestModel(request.body.config,messages,response.locals.aiDiagnostics); return response.json(parseGeneration(content)); }
  catch(error){return sendFailure(response,error);}
});
app.post('/api/ai/edit', async (request,response)=>{
  try {
    assertRateLimit(request); const body=request.body;
    if(typeof body?.prompt!=='string' || !body.prompt.trim() || body.prompt.length>8000 || typeof body.selection?.id!=='string') return response.status(400).json({error:'请输入修改指令并选择简历元素。'});
    const content=await requestModel(body.config,buildEditMessages(body.prompt,body.selection),response.locals.aiDiagnostics);
    return response.json({patch:parseEditPatch(content,body.selection.id)});
  } catch(error){return sendFailure(response,error);}
});
app.use((error,_request,response,_next)=>response.status(error.type==='entity.too.large'?413:400).json({error:error.type==='entity.too.large'?'资料过大，请减少文件大小。':'请求无效，请检查材料与网站来源。'}));

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(path.join(distDir, 'index.html')));
}

app.listen(port, () => console.log(`folio-atelier server listening on ${port}`));
