export const DEFAULT_AI_TIMEOUT_MS = 240_000;
export const MIN_AI_TIMEOUT_MS = 1_000;
// Keep a safety margin under the typical five-minute non-streaming proxy limit.
export const MAX_AI_TIMEOUT_MS = 270_000;
export const TIMEOUT_PHASES = ['checking_destination', 'waiting_response', 'reading_response', 'parsing_response'] as const;
export type TimeoutPhase = typeof TIMEOUT_PHASES[number];
export function parseAiTimeoutMs(input: unknown): number {
  if (input === undefined || input === null || input === '') return DEFAULT_AI_TIMEOUT_MS;
  const raw = typeof input === 'string' ? input.trim() : input;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < MIN_AI_TIMEOUT_MS || value > MAX_AI_TIMEOUT_MS) throw new Error('AI_REQUEST_TIMEOUT_MS 必须是 1000–270000 的整数毫秒值（默认240000）。');
  return value;
}
