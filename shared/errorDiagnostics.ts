import { TIMEOUT_PHASES, MAX_AI_TIMEOUT_MS } from './requestTimeout.ts';
// These fields are safe operational metadata only. Never include model response bodies or user data.
export const DIAGNOSTICS_VERSION = 1;
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export const KNOWN_UPSTREAM_CODES = ['invalid_request_error','invalid_type','unsupported_parameter','unsupported_value','model_not_found','invalid_model','unsupported_model','context_length_exceeded','content_policy_violation','invalid_image','image_too_large'] as const;
export const KNOWN_DIAGNOSTICS = ['unknown','protocol_mismatch','streaming_required','model_unavailable','image_unsupported','context_too_long','content_type','invalid_parameter','reasoning_parameter','request_timeout','upstream_timeout'] as const;
export function isSafeUpstreamParam(value: unknown): value is string {
  return typeof value === 'string' && /^(model|messages(?:\[\d{1,3}\])?(?:\.content(?:\[\d{1,3}\])?(?:\.image_url)?)?|input|stream|store|max_tokens|max_completion_tokens|image_url|temperature|reasoning|reasoning_effort|reasoning\.effort)$/.test(value);
}
export function safeModelLabel(value: unknown, secret?: string): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(value) && !/^sk[-_]|^bearer/i.test(value) && !(secret && value.includes(secret)) ? value : undefined;
}
export function safeBuildVersion(value: unknown): string {
  return typeof value === 'string' && /^[a-f0-9]{7,40}$/i.test(value) ? value.slice(0,7).toLowerCase() : 'unknown';
}
function record(value: unknown): Record<string,unknown> | null { return value && typeof value === 'object' ? value as Record<string,unknown> : null; }
export function formatApiFailure(payload: unknown, status: number, fallback: string): string {
  const data = record(payload);
  const message = typeof data?.error === 'string' ? data.error : fallback;
  if (!data) return `${message}（应用 HTTP ${status}）`;
  const details: string[] = [`应用 HTTP ${status}`];
  if (typeof data.upstreamStatus === 'number' && Number.isInteger(data.upstreamStatus) && data.upstreamStatus >= 400 && data.upstreamStatus <= 599) details.push(`上游 HTTP ${data.upstreamStatus}`);
  if (typeof data.diagnostic === 'string' && KNOWN_DIAGNOSTICS.includes(data.diagnostic as typeof KNOWN_DIAGNOSTICS[number])) details.push(`类别 ${data.diagnostic}`);
  if (typeof data.upstreamCode === 'string' && KNOWN_UPSTREAM_CODES.includes(data.upstreamCode as typeof KNOWN_UPSTREAM_CODES[number])) details.push(`错误码 ${data.upstreamCode}`);
  if (isSafeUpstreamParam(data.upstreamParam)) details.push(`参数 ${data.upstreamParam}`);
  const context = record(data.diagnostics);
  if (context?.protocol === 'chat_completions' || context?.protocol === 'responses') details.push(`协议 ${context.protocol}`);
  const model = safeModelLabel(context?.model); if (model) details.push(`模型 ${model}`);
  if (typeof context?.reasoningEffort === 'string' && REASONING_EFFORTS.includes(context.reasoningEffort as typeof REASONING_EFFORTS[number])) details.push(`推理 ${context.reasoningEffort}`);
  if (typeof context?.timeoutMs === 'number' && context.timeoutMs >= 1000 && context.timeoutMs <= MAX_AI_TIMEOUT_MS) details.push(`等待上限 ${context.timeoutMs/1000}秒`);
  if (typeof context?.elapsedMs === 'number' && Number.isFinite(context.elapsedMs) && context.elapsedMs >= 0 && context.elapsedMs <= 3_600_000) details.push(`耗时 ${(context.elapsedMs/1000).toFixed(1)}秒`);
  if (typeof context?.phase === 'string' && TIMEOUT_PHASES.includes(context.phase as typeof TIMEOUT_PHASES[number])) {
    const names:Record<string,string>={checking_destination:'校验连接',waiting_response:'等待通道响应',reading_response:'读取响应结果',parsing_response:'解析结果'};
    details.push(`阶段 ${names[context.phase]}`);
  }
  if (context?.hasImages === true) details.push('包含图片'); else if (context?.hasImages === false) details.push('纯文本');
  if (typeof context?.version === 'string') details.push(`版本 ${safeBuildVersion(context.version)}`);
  const trace = typeof data.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.requestId) ? data.requestId : null;
  return `${message}\n诊断：${details.join(' · ')}${trace ? `\n请求编号：${trace}` : ''}`;
}
