import { generationSchema } from '../../shared/contracts';
import type { GenerationResult, MaterialImage, ModelConfig } from '../types';
export async function requestGeneration(config: ModelConfig, profileText: string, jobText: string, profileImages: MaterialImage[], jobImages: MaterialImage[], signal?: AbortSignal): Promise<GenerationResult> {
  const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ config: { ...config, apiKey: config.mode === 'custom' ? config.apiKey : undefined }, profileText, jobText, profileImages, jobImages }) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : '生成服务不可用，请检查模型设置并重试。';
    throw new Error(error);
  }
  const result = generationSchema.safeParse(payload);
  if (!result.success) throw new Error('模型返回的简历数据不完整，原资料已保留，请重试。');
  return result.data;
}
