import type { ModelConfig } from '../types';
import type { CompletionMessage } from '../../shared/generation';

export function normalizeDirectUrl(input: string, pageProtocol?: string): string {
  let url:URL;
  try{url=new URL(input.trim());}catch{throw new Error('请输入完整的HTTP(S)模型接口URL。');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw new Error('模型URL必须是HTTP(S)地址，不能包含用户名、密码或片段。');
  if(pageProtocol==='https:'&&url.protocol==='http:')throw new Error('HTTPS网页不能直连HTTP模型接口，请使用HTTPS地址。');
  const path=url.pathname.replace(/\/+$/,'');
  if(!path.endsWith('/chat/completions'))url.pathname=path+'/chat/completions';
  return url.toString();
}

export async function requestDirectModel(config: ModelConfig, messages: CompletionMessage[], signal?: AbortSignal): Promise<string> {
  const url=normalizeDirectUrl(config.url,typeof window==='undefined'?undefined:window.location.protocol);
  const model=config.model.trim();if(!model)throw new Error('请填写自定义模型名称。');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(config.apiKey.trim())headers.Authorization=`Bearer ${config.apiKey.trim()}`;
  const timeout=AbortSignal.timeout(90_000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
    // This is deliberately a browser-to-provider request: never proxy or retry via /api.
    const response=await fetch(url,{method:'POST',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:combined,headers,body:JSON.stringify({model,messages})});
    if(!response.ok){
      if(response.status===401||response.status===403)throw new Error('自定义通道鉴权失败，请检查你的Key和权限。');
      if(response.status===429)throw new Error('自定义通道限流或额度不足，请稍后重试。');
      throw new Error(`自定义通道返回${response.status}，请检查URL、模型名称和图片能力。`);
    }
    const raw=await response.text();if(raw.length>1000000)throw new Error('模型返回内容过大，请精简资料后重试。');
    let payload:unknown;
    try{payload=JSON.parse(raw);}catch{throw new Error('模型接口未返回JSON，请检查是否填写了模型API地址而非网站首页。');}
    if(!payload||typeof payload!=='object'||!('choices' in payload)||!Array.isArray(payload.choices))throw new Error('该接口不是兼容的Chat Completions响应，请检查通道协议。');
    const choice:unknown=payload.choices[0];
    const message=choice&&typeof choice==='object'&&'message' in choice?choice.message:null;
    const content=message&&typeof message==='object'&&'content' in message?message.content:null;
    if(typeof content!=='string'||!content.trim())throw new Error('模型没有返回有效文本。');
    return content;
  }catch(error){
    if(signal?.aborted)throw error;
    if(timeout.aborted)throw new Error('模型请求超时，资料已保留，请重试。');
    if(error instanceof TypeError)throw new Error('浏览器无法连接自定义通道：请检查网络、接口URL和重定向，并确认通道允许本站的跨域访问（CORS）。不会自动转发到我们的后端。');
    throw error;
  }
}
