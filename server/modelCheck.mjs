import { getPresetDefinitions } from './presets.mjs';
import { resolveModelEndpoint } from '../shared/modelProtocol.ts';
import { safeModelLabel } from '../shared/errorDiagnostics.ts';

export function modelListUrl(baseUrl) {
  const { url } = resolveModelEndpoint(baseUrl);
  url.pathname = url.pathname.replace(/\/(chat\/completions|responses)$/, '/models');
  // Model lists use header authentication. Do not preserve query-string credentials/options.
  url.search = '';
  return url;
}

// Administrator-only CLI helper. Not exposed by any web API and never generates model content.
export async function checkConfiguredModel(environment = process.env, transport = fetch) {
  const preset = getPresetDefinitions(environment)[0];
  const key = (environment.CF_API_KEY || '').trim();
  const model = safeModelLabel(preset.model, key);
  const base = { configuredModel: model || '[invalid model id]', modelListed: null };
  if (!key || /^(REPLACE_WITH_|YOUR_|请|你的|在Railway)/i.test(key) || /\s|['"]/.test(key) || /^Bearer\b/i.test(key)) {
    return { ...base, status: 'configuration_error', note: '请在运行环境配置有效的 CF_API_KEY；只填令牌本身。工具不输出Key。' };
  }
  if (!model) return { ...base, status: 'configuration_error', note: 'CF_API_MODEL 不是安全有效的模型ID，请检查配置。' };
  let url;
  try { url = modelListUrl(preset.baseUrl); } catch { return { ...base, status: 'configuration_error', note: 'CF_API_BASE_URL 必须是有效的HTTP(S)接口地址。' }; }
  if (url.protocol === 'http:' && environment.ALLOW_PRIVATE_AI_URLS !== 'true') return { ...base, status: 'configuration_error', note: '请使用HTTPS模型接口；本地HTTP测试需要显式允许。' };
  try {
    const response = await transport(url.toString(), {
      method: 'GET', redirect: 'error', headers: { Accept: 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const note = response.status === 401 || response.status === 403
        ? '模型列表接口认证/访问被拒绝。不能据此断定模型不存在，请向中转核对令牌权限。'
        : [400,404,405].includes(response.status) ? '中转不接受标准模型列表查询，需在中转后台或向服务商确认准确模型ID。'
        : '模型列表查询失败，请向服务商核对。没有发送生成请求或用户材料。';
      return { ...base, status: 'list_unavailable', httpStatus: response.status, note };
    }
    const text = await response.text();
    if (text.length > 1_000_000) return { ...base, status: 'list_unavailable', httpStatus: 200, note: '模型列表过大，已停止处理，请在服务商后台核对。' };
    let payload;
    try { payload = JSON.parse(text); } catch { return { ...base, status: 'list_unavailable', httpStatus: 200, note: '接口未返回标准JSON模型列表。' }; }
    if (!Array.isArray(payload?.data)) return { ...base, status: 'list_unavailable', httpStatus: 200, note: '接口未返回标准 data[] 模型列表，请向服务商核对。' };
    const ids = [...new Set(payload.data.map(item => safeModelLabel(item?.id,key)).filter(Boolean))];
    const listed = ids.includes(model);
    return {
      configuredModel: model, status: listed ? 'listed' : 'not_listed', httpStatus: 200,
      modelListed: listed, modelCount: ids.length, modelIds: ids.slice(0,200), displayTruncated: ids.length > 200,
      note: listed ? '此ID出现在列表中，但不保证这个令牌分组有可用生成通道；若仍报400，请服务商检查模型映射、分组与路由。'
        : '此ID未出现在返回列表。请确认服务商的准确API模型ID和令牌分组；列表本身也可能不是逐令牌授权范围，不能自动判定或切换模型。',
    };
  } catch {
    // Never output a raw network error: it can include credentials or gateway content.
    return { ...base, status: 'list_unavailable', note: '模型列表查询超时或连接失败，请检查网络/接口配置。没有生成请求。' };
  }
}
