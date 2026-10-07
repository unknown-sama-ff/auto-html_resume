import 'dotenv/config';
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
app.use(express.json({ limit: '2mb' }));

const builtInPresets = [
  { id: 'openai', label: 'OpenAI', provider: 'OpenAI-compatible', baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY', description: 'Railway 环境变量：OPENAI_API_KEY' },
  { id: 'deepseek', label: 'DeepSeek', provider: 'OpenAI-compatible', baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1', model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', keyEnv: 'DEEPSEEK_API_KEY', description: 'Railway 环境变量：DEEPSEEK_API_KEY' },
  { id: 'cf-api-fan', label: 'cf.api.fan · gpt-6.1-sol', provider: 'OpenAI-compatible relay', baseUrl: process.env.CF_API_BASE_URL || 'https://cf.api.fan/v1', model: process.env.CF_API_MODEL || 'gpt-6.1-sol', keyEnv: 'CF_API_KEY', description: 'Railway 环境变量：CF_API_KEY' },
];

function getPresetDefinitions() {
  const raw = process.env.AI_PRESETS_JSON;
  if (!raw) return builtInPresets;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return builtInPresets;
    const custom = parsed.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.baseUrl === 'string' && typeof item.model === 'string' && typeof item.keyEnv === 'string').map((item) => ({ id: item.id, label: item.label, provider: typeof item.provider === 'string' ? item.provider : 'OpenAI-compatible', baseUrl: item.baseUrl, model: item.model, keyEnv: item.keyEnv, description: typeof item.description === 'string' ? item.description : `Railway 环境变量：${item.keyEnv}` }));
    return custom.length > 0 ? custom : builtInPresets;
  } catch { return builtInPresets; }
}

function publicPreset(preset) {
  return { id: preset.id, label: preset.label, provider: preset.provider, model: preset.model, baseUrl: preset.baseUrl, description: preset.description };
}

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
  if (config.mode === 'custom') {
    if (typeof config.url !== 'string' || !config.url.trim()) throw new Error('请输入自定义模型的完整 URL');
    if (typeof config.model !== 'string' || !config.model.trim()) throw new Error('请输入模型名称');
    return { url: normalizeCompletionUrl(config.url.trim()), model: config.model.trim(), apiKey: typeof config.apiKey === 'string' ? config.apiKey.trim() : '' };
  }
  const definitions = getPresetDefinitions();
  const preset = definitions.find((item) => item.id === config.presetId) || definitions[0];
  if (!preset) throw new Error('没有可用的后端模型预设');
  const apiKey = process.env[preset.keyEnv] || '';
  if (!apiKey) throw new Error(`Railway 尚未配置 ${preset.keyEnv}`);
  return { url: normalizeCompletionUrl(preset.baseUrl), model: preset.model, apiKey };
}

function makeSystemPrompt() {
  return `你是一个安全的简历编辑器。你只能针对用户选中的简历节点返回一个结构化修改补丁，不得输出 HTML、JavaScript、脚本、外部资源或任意 CSS。只能使用 setStyle、rewriteText、setTheme 三种 operation。允许的 path：style.color、style.fontSize、style.fontWeight、style.marginBottom、style.accent、design.avatarShape、content.text、content.bullets。必须保留用户没有提供的事实，不得编造数字、公司、学校、项目结果或技能。输出严格 JSON，不要 Markdown 代码围栏，格式为：{ "targetNodeId": "...", "operation": "setStyle|rewriteText|setTheme", "path": "...", "value": "...", "reason": "...", "requiresConfirmation": true|false, "preview": "..." }。文案改写 requiresConfirmation 必须为 true；纯样式调整可以为 false。`;
}

function makeUserPrompt(body) {
  return JSON.stringify({ instruction: body.prompt, selectedNode: body.selection, resumeContext: body.resume, constraints: { targetNodeId: body.selection?.id, allowedOperations: ['setStyle', 'rewriteText', 'setTheme'], allowedPaths: ['style.color', 'style.fontSize', 'style.fontWeight', 'style.marginBottom', 'style.accent', 'design.avatarShape', 'content.text', 'content.bullets'] } });
}

function extractMessageContent(payload) {
  const value = payload?.choices?.[0]?.message?.content;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((part) => typeof part?.text === 'string' ? part.text : '').join('');
  return '';
}

function parsePatch(content) {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  const patch = parsed && typeof parsed.patch === 'object' ? parsed.patch : parsed;
  if (!patch || typeof patch !== 'object') throw new Error('模型没有返回有效补丁');
  if (typeof patch.targetNodeId !== 'string' || typeof patch.operation !== 'string' || typeof patch.path !== 'string') throw new Error('模型补丁缺少目标节点或操作');
  if (!['setStyle', 'rewriteText', 'setTheme'].includes(patch.operation)) throw new Error('模型返回了不允许的操作');
  const allowedPaths = ['style.color', 'style.fontSize', 'style.fontWeight', 'style.marginBottom', 'style.accent', 'design.avatarShape', 'content.text', 'content.bullets'];
  if (!allowedPaths.includes(patch.path)) throw new Error('模型返回了不允许的属性');
  if (typeof patch.value !== 'string' && typeof patch.value !== 'number' && typeof patch.value !== 'boolean') throw new Error('模型补丁值类型不受支持');
  return { id: typeof patch.id === 'string' ? patch.id : `patch-${Date.now()}`, targetNodeId: patch.targetNodeId, operation: patch.operation, path: patch.path, value: patch.value, reason: typeof patch.reason === 'string' ? patch.reason : 'AI 根据当前选择给出了局部修改建议。', requiresConfirmation: patch.operation === 'rewriteText' || patch.requiresConfirmation === true, preview: typeof patch.preview === 'string' ? patch.preview : '已生成一个局部修改建议。' };
}

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'folio-atelier', presets: getPresetDefinitions().map(publicPreset) }));
app.get('/api/ai/presets', (_request, response) => response.json(getPresetDefinitions().map(publicPreset)));

app.post('/api/ai/edit', async (request, response) => {
  try {
    assertRateLimit(request);
    const body = request.body || {};
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) return response.status(400).json({ error: '请输入修改指令' });
    if (!body.selection || typeof body.selection.id !== 'string') return response.status(400).json({ error: '缺少当前选中元素上下文' });
    const provider = resolveProviderConfig(body.config);
    await assertSafeDestination(provider.url);
    const headers = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);
    let upstream;
    try {
      upstream = await fetch(provider.url, { method: 'POST', headers, redirect: 'manual', signal: controller.signal, body: JSON.stringify({ model: provider.model, temperature: 0.2, messages: [{ role: 'system', content: makeSystemPrompt() }, { role: 'user', content: makeUserPrompt(body) }] }) });
    } finally { clearTimeout(timeout); }
    if (upstream.status >= 300 && upstream.status < 400) return response.status(502).json({ error: 'AI 服务返回了重定向，已为安全起见拒绝' });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return response.status(502).json({ error: payload?.error?.message || payload?.message || `上游模型返回 ${upstream.status}` });
    const content = extractMessageContent(payload);
    if (!content) return response.status(502).json({ error: '上游模型没有返回文本内容' });
    return response.json({ patch: parsePatch(content), provider: { model: provider.model } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 请求失败';
    const status = message.includes('尚未配置') || message.includes('请输入') || message.includes('未被允许') || message.includes('本地') || message.includes('私网') || message.includes('频繁') ? 400 : 502;
    return response.status(status).json({ error: message });
  }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(path.join(distDir, 'index.html')));
}

app.listen(port, () => console.log(`folio-atelier server listening on ${port}`));


