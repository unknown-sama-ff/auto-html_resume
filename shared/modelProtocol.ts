import type { CompletionMessage } from './generation.ts';
import { REASONING_EFFORTS, KNOWN_UPSTREAM_CODES, isSafeUpstreamParam } from './errorDiagnostics.ts';

export type ModelProtocol = 'chat_completions' | 'responses';
export type ProtocolChoice = ModelProtocol | 'auto';
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export function resolveModelEndpoint(input: string, choice: string = 'auto') {
  if (!['auto', 'chat_completions', 'responses'].includes(choice)) throw new Error('CF_API_PROTOCOL 只支持 auto、chat_completions 或 responses。');
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('请输入完整的 HTTP(S) 模型接口 URL。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('模型URL必须是HTTP(S)地址，不能包含用户名、密码或片段。');
  let path = url.pathname.replace(/\/+$/, '');
  const explicitResponses = path.endsWith('/responses');
  const protocol: ModelProtocol = choice === 'auto' ? explicitResponses ? 'responses' : 'chat_completions' : choice as ModelProtocol;
  if (path.endsWith('/chat/completions')) path = path.slice(0, -'/chat/completions'.length);
  else if (explicitResponses) path = path.slice(0, -'/responses'.length);
  url.pathname = path + (protocol === 'responses' ? '/responses' : '/chat/completions');
  return { url, protocol };
}

export function parseReasoningEffort(value: unknown): ReasoningEffort {
  if (typeof value !== 'string' || !REASONING_EFFORTS.includes(value as ReasoningEffort)) throw new Error('思考强度只支持 none、minimal、low、medium、high、xhigh。');
  return value as ReasoningEffort;
}

export function buildModelRequest(model: string, messages: CompletionMessage[], protocol: ModelProtocol, reasoningEffort?: ReasoningEffort) {
  const normalized = messages.map(message => ({ ...message, content: Array.isArray(message.content) && message.content.every(part => part.type === 'text') ? message.content.map(part => part.type === 'text' ? part.text : '').join('\n') : message.content }));
  if (protocol === 'chat_completions') return { model, messages: normalized, stream: false, ...(reasoningEffort && reasoningEffort !== 'none' ? { reasoning_effort: reasoningEffort } : {}) };
  const instructions = normalized.filter(message => message.role === 'system').map(message => typeof message.content === 'string' ? message.content : message.content.filter(part => part.type === 'text').map(part => part.type === 'text' ? part.text : '').join('\n')).join('\n\n');
  const input = normalized.filter(message => message.role !== 'system').map(message => ({
    role: message.role,
    content: typeof message.content === 'string'
      ? [{ type: 'input_text', text: message.content }]
      : message.content.map(part => part.type === 'text' ? { type: 'input_text', text: part.text } : { type: 'input_image', image_url: part.image_url.url }),
  }));
  return { model, instructions, input, store: false, stream: false, ...(reasoningEffort && reasoningEffort !== 'none' ? { reasoning: { effort: reasoningEffort } } : {}) };
}

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' ? value as Record<string, unknown> : null; }
export function extractModelText(payload: unknown, protocol: ModelProtocol): string {
  const root = object(payload);
  if (!root) throw new Error('模型返回的数据不是有效JSON对象。');
  if (protocol === 'responses') {
    if (root.status === 'incomplete' || root.status === 'failed') throw new Error('模型响应未完成，请精简资料或检查通道设置后重试。');
    if (typeof root.output_text === 'string' && root.output_text.trim()) return root.output_text;
    const texts: string[] = [];
    if (Array.isArray(root.output)) for (const item of root.output) {
      const output = object(item);
      if (output?.type !== 'message' || !Array.isArray(output.content)) continue;
      for (const value of output.content) {
        const part = object(value);
        if (part?.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
      }
    }
    if (texts.join('').trim()) return texts.join('');
    throw new Error('Responses接口没有返回有效文本，请核对模型与接口协议。');
  }
  const first = Array.isArray(root.choices) ? object(root.choices[0]) : null;
  const message = object(first?.message);
  if (typeof message?.content === 'string' && message.content.trim()) return message.content;
  if (Array.isArray(message?.content)) {
    const text = message.content.map(value => object(value)).filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part?.text).join('');
    if (text.trim()) return text;
  }
  throw new Error('Chat Completions接口没有返回有效文本，请核对模型与接口协议。');
}

// Classify only known error patterns. Never return raw upstream text: it can echo Keys or resumes.
export function describeBadRequest(payload: unknown) {
  const root = object(payload); const error = object(root?.error) ?? root;
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : typeof root?.error === 'string' ? root.error.toLowerCase() : '';
  const rawCode = typeof error?.code === 'string' ? error.code : typeof error?.type === 'string' ? error.type : '';
  const code = KNOWN_UPSTREAM_CODES.includes(rawCode as typeof KNOWN_UPSTREAM_CODES[number]) ? rawCode : undefined;
  const rawParam = typeof error?.param === 'string' ? error.param : '';
  const param = isSafeUpstreamParam(rawParam) ? rawParam : undefined;
  let diagnostic = 'unknown';
  let hint = '通道未接受请求参数。请先仅用短文本测试，再核对模型名称及接口协议。';
  if (param === 'reasoning_effort' || param === 'reasoning.effort' || (/reasoning_effort|reasoning\.effort/.test(message) && /unsupported|not support|unknown|invalid|不支持|无效/.test(message))) {
    diagnostic = 'reasoning_parameter'; hint = '通道拒绝思考强度参数，不等于模型不存在。自定义URL可在AI模型设置中选择“通道默认”后重试；作者预设固定为medium，请核对通道是否支持该强度。';
  } else if (/responses/.test(message) && /only|must|use|support|endpoint|仅|使用|支持/.test(message)) {
    diagnostic = 'protocol_mismatch'; hint = '通道提示应使用 Responses API。作者预设可设置 CF_API_PROTOCOL=responses；自定义URL请填写完整的 /v1/responses 地址。';
  } else if ((/non[- ]?stream(?:ing)?|非流式/.test(message) && /unsupported|not support|not available|不支持|不可用/.test(message)) || (!/non[- ]?stream(?:ing)?|非流式/.test(message) && /stream/.test(message) && /required|must|only|true|必须|开启/.test(message))) {
    diagnostic = 'streaming_required'; hint = '通道要求流式请求，当前使用非流式JSON返回；请确认此通道支持非流式或向服务商核对接入要求。';
  } else if (/image|vision|图片|图像/.test(message) && /unsupported|not support|invalid|不支持|无法/.test(message)) {
    diagnostic = 'image_unsupported'; hint = '通道未接受图片输入。先不上传截图/图片，仅用文字或文字PDF/DOCX测试，或选择支持视觉的模型。';
  } else if (/^(model_not_found|invalid_model|unsupported_model)$/.test(code ?? '') || ((param === 'model' || /model|模型/.test(message)) && /not found|does not exist|unsupported|invalid model|not available|没有|不存在|不支持|不可用/.test(message))) {
    diagnostic = 'model_unavailable'; hint = '通道未识别或不支持该模型。请使用此API令牌所属分组的可用模型名称，不要根据网页展示名推断API名称。';
  } else if (/context_length_exceeded/.test(code ?? '') || /context.{0,30}(exceed|maximum)|too many tokens|上下文.*超|长度.*超/.test(message)) {
    diagnostic = 'context_too_long'; hint = '资料超过通道的上下文限制，请缩短个人材料和岗位要求后重试。';
  } else if (/content/.test(message) && /string/.test(message) && /expected|must|invalid type|需要|必须/.test(message)) {
    diagnostic = 'content_type'; hint = '通道要求文字内容为字符串。新版已将纯文本请求改为字符串；请确认部署到最新版后再用短文本测试。';
  } else if (param) {
    diagnostic = 'invalid_parameter'; hint = `通道拒绝参数 ${param}。请核对该通道的接口协议和支持的请求字段。`;
  }
  return { hint, diagnostic, ...(code ? { upstreamCode: code } : {}), ...(param ? { upstreamParam: param } : {}) };
}
