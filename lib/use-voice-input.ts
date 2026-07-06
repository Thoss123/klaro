import { useCallback, useRef, useState } from 'react';

export type VoiceInputState = 'idle' | 'recording' | 'transcribing';

function pickRecorderMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
}

export function useVoiceInput({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<VoiceInputState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupStream();
      return Promise.resolve(null);
    }

    return new Promise(resolve => {
      recorder.onstop = () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: mimeRef.current })
          : null;
        chunksRef.current = [];
        recorderRef.current = null;
        cleanupStream();
        resolve(blob);
      };
      recorder.stop();
    });
  }, [cleanupStream]);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState('transcribing');
      try {
        const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
        const form = new FormData();
        form.append('file', blob, `recording.${ext}`);

        const res = await fetch('/api/transcribe', { method: 'POST', body: form, credentials: 'include' });
        const data = await res.json();
        if (res.status === 402 && data?.code === 'INSUFFICIENT_CREDITS') {
          throw new Error('Deine Test-Credits sind aufgebraucht. Lade im Account Credits auf und versuche es erneut.');
        }
        if (!res.ok) throw new Error(data.error || 'Transkription fehlgeschlagen');

        const text = typeof data.text === 'string' ? data.text.trim() : '';
        if (!text) throw new Error('Keine Sprache erkannt');
        onTranscript(text);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Spracherkennung fehlgeschlagen');
      } finally {
        setState('idle');
      }
    },
    [onTranscript],
  );

  const startRecording = useCallback(async () => {
    if (disabled || state !== 'idle') return;
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Mikrofon wird in diesem Browser nicht unterstützt');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickRecorderMime();
      mimeRef.current = mime ?? 'audio/webm';
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setState('recording');
    } catch (e: unknown) {
      cleanupStream();
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Mikrofon-Zugriff verweigert — bitte in den Browser-Einstellungen erlauben');
      } else {
        setError(e instanceof Error ? e.message : 'Mikrofon konnte nicht gestartet werden');
      }
      setState('idle');
    }
  }, [cleanupStream, disabled, state]);

  const toggle = useCallback(async () => {
    if (disabled) return;
    if (state === 'recording') {
      const blob = await stopRecording();
      if (!blob || blob.size === 0) {
        setState('idle');
        setError('Aufnahme zu kurz — bitte etwas länger sprechen');
        return;
      }
      await transcribe(blob);
      return;
    }
    if (state === 'idle') {
      await startRecording();
    }
  }, [disabled, startRecording, state, stopRecording, transcribe]);

  const cancel = useCallback(async () => {
    if (state !== 'recording') return;
    await stopRecording();
    setState('idle');
    setError(null);
  }, [state, stopRecording]);

  return { state, error, toggle, cancel, clearError: () => setError(null) };
}
