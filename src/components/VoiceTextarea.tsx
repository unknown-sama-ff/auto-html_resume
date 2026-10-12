import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextareaHTMLAttributes, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Mic, MicOff } from 'lucide-react';
import {
  getSpeechRecognitionConstructor,
  hasVoiceConsent,
  mapVoiceRecognitionError,
  replaceTextSelection,
  saveVoiceConsent,
  transcriptFromResults,
  type SpeechRecognitionLike,
} from '../lib/voiceInput';

export type VoiceTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  label: string;
  lang?: string;
};

type SelectionSnapshot = {
  value: string;
  start: number;
  end: number;
};

const defaultLang = 'zh-CN';

export function VoiceTextarea({ value, onChange, label, lang = defaultLang, disabled, ...textareaProps }: VoiceTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceButtonRef = useRef<HTMLButtonElement>(null);
  const consentCancelRef = useRef<HTMLButtonElement>(null);
  const consentConfirmRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const snapshotRef = useRef<SelectionSnapshot | null>(null);
  const transcriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const cancelledRef = useRef(false);
  const failedRef = useRef(false);
  const mountedRef = useRef(true);
  const [recording, setRecording] = useState(false);
  const [pendingConsent, setPendingConsent] = useState(false);
  const [status, setStatus] = useState('');

  const restoreSnapshot = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (snapshot) onChange(snapshot.value);
  }, [onChange]);

  const clearRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    }
    snapshotRef.current = null;
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
  }, []);

  const finish = useCallback((cancel: boolean, message = '') => {
    cancelledRef.current = cancel;
    if (cancel) restoreSnapshot();
    if (message) setStatus(message);
    setRecording(false);
  }, [restoreSnapshot]);

  const stopRecognition = useCallback((cancel = false) => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      if (cancel) finish(true);
      return;
    }
    cancelledRef.current = cancel;
    if (cancel) {
      restoreSnapshot();
      try {
        recognition.abort?.();
      } catch {
        // Some browser implementations throw when aborting an already-ended recognition.
      }
    } else {
      try {
        recognition.stop();
      } catch {
        restoreSnapshot();
        clearRecognition();
        setRecording(false);
        setStatus(mapVoiceRecognitionError('start-failed'));
      }
    }
    setRecording(false);
  }, [clearRecognition, finish, restoreSnapshot]);

  const startRecognition = useCallback(() => {
    if (disabled || recording) return;
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) {
      setStatus(mapVoiceRecognitionError('unsupported'));
      return;
    }

    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    snapshotRef.current = { value, start, end };
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    cancelledRef.current = false;
    failedRef.current = false;
    setStatus('正在启动语音输入…');

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Constructor();
    } catch {
      restoreSnapshot();
      setStatus(mapVoiceRecognitionError('start-failed'));
      return;
    }
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.onstart = () => {
      if (!mountedRef.current) return;
      setRecording(true);
      setStatus('正在听，请松开按钮结束。');
    };
    recognition.onresult = event => {
      if (!mountedRef.current || cancelledRef.current) return;
      const transcript = transcriptFromResults(event.results);
      finalTranscriptRef.current = transcript.final;
      transcriptRef.current = `${transcript.final}${transcript.interim}`;
      const snapshot = snapshotRef.current;
      if (!snapshot) return;
      onChange(replaceTextSelection(snapshot.value, snapshot.start, snapshot.end, transcriptRef.current));
      setStatus(transcript.interim ? `正在识别：${transcript.interim}` : '已识别，请继续说或松开结束。');
    };
    recognition.onerror = event => {
      if (!mountedRef.current) return;
      const aborted = cancelledRef.current || event.error === 'aborted';
      failedRef.current = !aborted;
      restoreSnapshot();
      setRecording(false);
      if (!aborted) setStatus(mapVoiceRecognitionError(event.error ?? 'start-failed'));
    };
    recognition.onend = () => {
      if (!mountedRef.current) return;
      const cancelled = cancelledRef.current;
      const hasFinal = Boolean(finalTranscriptRef.current.trim());
      if (cancelled || !hasFinal) restoreSnapshot();
      setRecording(false);
      if (!cancelled && !failedRef.current && !hasFinal) setStatus(mapVoiceRecognitionError('no-speech'));
      if (!cancelled && hasFinal) setStatus('语音输入已完成。');
      clearRecognition();
    };

    try {
      recognition.start();
    } catch {
      restoreSnapshot();
      setRecording(false);
      clearRecognition();
      setStatus(mapVoiceRecognitionError('start-failed'));
    }
  }, [clearRecognition, disabled, lang, onChange, recording, restoreSnapshot, value]);

  const requestStart = useCallback(() => {
    if (disabled || recording) return;
    if (!getSpeechRecognitionConstructor()) {
      setStatus(mapVoiceRecognitionError('unsupported'));
      return;
    }
    if (!hasVoiceConsent()) {
      setPendingConsent(true);
      requestAnimationFrame(() => consentCancelRef.current?.focus());
      return;
    }
    startRecognition();
  }, [disabled, recording, startRecognition]);

  const confirmConsent = useCallback(() => {
    saveVoiceConsent();
    setPendingConsent(false);
    setStatus('已允许语音识别，请按住按钮开始。');
    requestAnimationFrame(() => voiceButtonRef.current?.focus());
  }, []);

  const closeConsent = useCallback(() => {
    setPendingConsent(false);
    requestAnimationFrame(() => voiceButtonRef.current?.focus());
  }, []);

  const handleConsentKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeConsent();
      return;
    }
    if (event.key !== 'Tab') return;
    const first = consentCancelRef.current;
    const last = consentConfirmRef.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [closeConsent]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events and browsers without an active pointer can reject capture.
    }
    requestStart();
  }, [disabled, requestStart]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    stopRecognition(false);
  }, [stopRecognition]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    stopRecognition(true);
  }, [stopRecognition]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat || recording) return;
    requestStart();
  }, [recording, requestStart]);

  const handleKeyUp = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    stopRecognition(false);
  }, [stopRecognition]);

  useEffect(() => {
    mountedRef.current = true;
    const handleBlur = () => stopRecognition(true);
    const handleVisibility = () => { if (document.hidden) stopRecognition(true); };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      mountedRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.abort?.();
        } catch {
          // Recognition may already have ended while the component unmounts.
        }
      }
      clearRecognition();
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearRecognition, stopRecognition]);

  return <div className={`voice-textarea ${recording ? 'is-recording' : ''}`}>
    <textarea ref={textareaRef} {...textareaProps} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
    <div className="voice-textarea-actions">
      <button
        ref={voiceButtonRef}
        type="button"
        className="voice-textarea-button"
        aria-label={recording ? `松开结束语音输入：${label}` : `按住说话：${label}`}
        aria-pressed={recording}
        disabled={disabled}
        style={{ minWidth: 44, minHeight: 44 }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onBlur={() => { if (recording) stopRecognition(true); }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      >
        {recording ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
        <span>{recording ? '松开结束' : '按住说话'}</span>
      </button>
      {status && <span className="voice-textarea-status" role="status" aria-live="polite">{status}</span>}
    </div>
    {pendingConsent && <div className="voice-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-consent-title" onKeyDown={handleConsentKeyDown}>
      <div className="voice-consent-panel">
        <h2 id="voice-consent-title">允许使用语音输入？</h2>
        <p>浏览器的语音识别服务可能会处理你说出的音频。本站不会保存录音，也不会新增上传接口。</p>
        <div className="voice-consent-actions">
          <button ref={consentCancelRef} type="button" className="voice-consent-cancel" onClick={closeConsent}>暂不使用</button>
          <button ref={consentConfirmRef} type="button" className="voice-consent-confirm" onClick={confirmConsent}>同意</button>
        </div>
      </div>
    </div>}
  </div>;
}

export default VoiceTextarea;
