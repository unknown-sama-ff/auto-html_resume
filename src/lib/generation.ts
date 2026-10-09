import { formatApiFailure } from '../../shared/errorDiagnostics';
import { generationSchema } from '../../shared/contracts';
import { runGeneration } from '../../shared/generationPipeline';
import { DEFAULT_AI_TIMEOUT_MS } from '../../shared/requestTimeout';
import { requestDirectModel } from './directModel';
import type { GenerationResult, MaterialImage, ModelConfig } from '../types';
import { templateDesign, type TemplateId } from '../../shared/design';

export async function requestGeneration(config: ModelConfig, profileText: string, jobText: string, profileImages: MaterialImage[], jobImages: MaterialImage[], signal?: AbortSignal, templateId: TemplateId | 'auto' = 'auto'): Promise<GenerationResult> {
  if(config.mode==='custom'){
    const timeout=AbortSignal.timeout(DEFAULT_AI_TIMEOUT_MS);
    const combined=signal?AbortSignal.any([signal,timeout]):timeout;
    try {
      return await runGeneration({config,profileText,jobText,profileImages,jobImages,templateId}, messages=>requestDirectModel(config,messages,combined), combined);
    } catch(error) {
      if (!signal?.aborted && timeout.aborted) throw new Error(`分析与岗位改写达到 ${DEFAULT_AI_TIMEOUT_MS/1000} 秒总等待上限，原资料已保留，请重试。`);
      throw error;
    }
  }
  const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ config: { mode:'preset',presetId:config.presetId }, profileText, jobText, profileImages, jobImages, templateId }) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(formatApiFailure(payload,response.status,'生成服务不可用，请检查模型设置并重试。'));
  }
  const result = generationSchema.safeParse(payload);
  if (!result.success) throw new Error('模型返回的简历数据不完整，原资料已保留，请重试。');
  if (templateId !== 'auto') result.data.resume.design = { ...templateDesign(templateId), avatarShape: result.data.resume.design.avatarShape };
  return result.data;
}
