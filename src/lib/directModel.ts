import { DEFAULT_AI_TIMEOUT_MS, parseAiTimeoutMs } from '../../shared/requestTimeout';
import type { ModelConfig } from '../types';
import type { CompletionMessage } from '../../shared/generation';
import { resolveModelEndpoint, buildModelRequest, extractModelText, describeBadRequest } from '../../shared/modelProtocol';

export function normalizeDirectUrl(input: string, pageProtocol?: string): string {
  const {url}=resolveModelEndpoint(input);
  if(pageProtocol==='https:'&&url.protocol==='http:')throw new Error('HTTPS网页不能直连HTTP模型接口，请使用HTTPS地址。');
  return url.toString();
}

export async function requestDirectModel(config: ModelConfig, messages: CompletionMessage[], signal?: AbortSignal, options: {timeoutMs?:number} = {}): Promise<string> {
  const url=normalizeDirectUrl(config.url,typeof window==='undefined'?undefined:window.location.protocol);
  const {protocol}=resolveModelEndpoint(url);
  const model=config.model.trim();if(!model)throw new Error('请填写自定义模型名称。');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(config.apiKey.trim())headers.Authorization=`Bearer ${config.apiKey.trim()}`;
  const timeoutMs=parseAiTimeoutMs(options.timeoutMs??DEFAULT_AI_TIMEOUT_MS);
  const timeout=AbortSignal.timeout(timeoutMs);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
    // This is deliberately a browser-to-provider request: never proxy or retry via /api.
    const response=await fetch(url,{method:'POST',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:combined,headers,body:JSON.stringify(buildModelRequest(model,messages,protocol))});
    if(!response.ok){
      if(response.status===401||response.status===403)throw new Error('自定义通道鉴权失败，请检查你的Key和权限。');
      if(response.status===400){
        const raw=await response.text();let data:unknown=null;
        if(raw.length<=64000){try{data=JSON.parse(raw);}catch{/* Ignore untrusted error bodies. */}}
        throw new Error(`自定义通道请求被拒绝（上游 HTTP 400）。${describeBadRequest(data).hint}`);
      }
      if(response.status===408||response.status===504)throw new Error(`自定义通道自身返回 HTTP ${response.status} 超时，请向通道核对排队与响应限制；不会自动重试。`);
      if(response.status===429)throw new Error('自定义通道限流或额度不足，请稍后重试。');
      throw new Error(`自定义通道返回${response.status}，请检查URL、模型名称和图片能力。`);
    }
    const raw=await response.text();if(raw.length>1000000)throw new Error('模型返回内容过大，请精简资料后重试。');
    let payload:unknown;
    try{payload=JSON.parse(raw);}catch{throw new Error('模型接口未返回JSON，请检查是否填写了模型API地址而非网站首页。');}
    return extractModelText(payload,protocol);
  }catch(error){
    if(signal?.aborted)throw error;
    if(timeout.aborted)throw new Error(`模型请求达到 ${Math.round(timeoutMs/1000)} 秒等待上限，资料已保留，请缩短资料或降低推理强度；不会自动重试。`);
    if(error instanceof TypeError)throw new Error('浏览器无法连接自定义通道：请检查网络、接口URL和重定向，并确认通道允许本站的跨域访问（CORS）。不会自动转发到我们的后端。');
    throw error;
  }
}
