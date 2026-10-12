export const VOICE_CONSENT_VERSION = 'v1';
export const VOICE_CONSENT_STORAGE_KEY = `easy-resume-voice-consent-${VOICE_CONSENT_VERSION}`;
export const VOICE_CONSENT_KEY = VOICE_CONSENT_STORAGE_KEY;

export type VoiceRecognitionError =
  | 'aborted'
  | 'audio-capture'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'unsupported'
  | 'start-failed'
  | string;

/** Replace the selected range while preserving the text before and after it. */
export function replaceTextSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
): string {
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

/** Compatibility alias used by callers that describe the operation as insertion. */
export const insertAtSelection = replaceTextSelection;
export const replaceSelection = replaceTextSelection;

export function mapVoiceRecognitionError(error: VoiceRecognitionError): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '语音输入未获授权，请允许浏览器使用麦克风后重试。';
    case 'no-speech':
      return '没有听到语音，请按住按钮再试。';
    case 'audio-capture':
      return '找不到麦克风，请检查设备后重试。';
    case 'language-not-supported':
      return '当前浏览器不支持中文语音识别，请继续使用文字输入。';
    case 'unsupported':
      return '当前浏览器不支持语音输入，请继续使用文字输入。';
    case 'aborted':
      return '语音输入已取消。';
    case 'network':
    case 'start-failed':
    default:
      return '语音输入启动失败，请重试。';
  }
}

export const getVoiceErrorMessage = mapVoiceRecognitionError;

export function hasVoiceConsent(storage: Storage | null | undefined = getStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(VOICE_CONSENT_STORAGE_KEY) === VOICE_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export const isVoiceConsentGranted = hasVoiceConsent;

export function saveVoiceConsent(storage: Storage | null | undefined = getStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(VOICE_CONSENT_STORAGE_KEY, VOICE_CONSENT_VERSION);
    return true;
  } catch {
    return false;
  }
}

export const recordVoiceConsent = saveVoiceConsent;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const scope = globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: { transcript?: string };
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function transcriptFromResults(results: SpeechRecognitionResultListLike): { final: string; interim: string } {
  let final = '';
  let interim = '';
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const transcript = result?.[0]?.transcript ?? '';
    if (result?.isFinal) final += transcript;
    else interim += transcript;
  }
  return { final, interim };
}

function getStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
