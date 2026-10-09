import { formatApiFailure } from '../../shared/errorDiagnostics';
import { generationSchema } from '../../shared/contracts';
import { buildGenerationMessages, parseGeneration } from '../../shared/generation';
import { requestDirectModel } from './directModel';
import type { GenerationResult, MaterialImage, ModelConfig } from '../types';
import { templateDesign, type TemplateId } from '../../shared/design';

export async function requestGeneration(config: ModelConfig, profileText: string, jobText: string, profileImages: MaterialImage[], jobImages: MaterialImage[], signal?: AbortSignal, templateId: TemplateId | 'auto' = 'auto'): Promise<GenerationResult> {
  if(config.mode==='custom'){
    const messages=buildGenerationMessages({config,profileText,jobText,profileImages,jobImages,templateId});
    return parseGeneration(await requestDirectModel(config,messages,signal), profileText, templateId, { hasProfileImages: profileImages.length > 0 });
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
