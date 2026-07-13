import React, { FormEvent, useRef, useEffect, useState, useCallback } from 'react';
import { ArrowUp, ImageIcon, Loader2, Mic, Paperclip, FileText, Square, X } from 'lucide-react';
import type { ChatAttachment } from '@/lib/chat-attachments';
import { useVoiceInput } from '@/lib/use-voice-input';

const FILE_ACCEPT = '.txt,.md,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.log,.rtf,.pdf,application/pdf,text/*,image/png,image/jpeg,image/webp,image/gif,image/*';

function attachmentPreviewUrl(a: ChatAttachment): string | undefined {
  if (a.url) return a.url;
  if (a.base64 && a.mimeType) return `data:${a.mimeType};base64,${a.base64}`;
  return undefined;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  isStreaming,
  onStop,
  attachments,
  onAttachmentsChange,
  sessionId,
  compact = false,
  backgroundStatus,
  allowAttachments = true,
}: {
  value: string
  onChange: (s: string) => void
  onSubmit: (e: FormEvent) => void
  disabled: boolean
  isStreaming?: boolean
  onStop?: () => void
  attachments: ChatAttachment[]
  onAttachmentsChange: (a: ChatAttachment[]) => void
  sessionId?: string | null
  compact?: boolean
  /** Shown while canvas/memory sync runs after the coach reply finished */
  backgroundStatus?: string | null
  allowAttachments?: boolean
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const appendTranscript = useCallback(
    (text: string) => {
      const next = value.trim() ? `${value.trimEnd()} ${text}` : text;
      onChange(next);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
        el.focus();
      });
    },
    [onChange, value],
  );

  const voiceDisabled = disabled || uploading || isStreaming;
  const { state: voiceState, error: voiceError, toggle: toggleVoice, clearError: clearVoiceError } =
    useVoiceInput({ onTranscript: appendTranscript, disabled: voiceDisabled });

  useEffect(() => {
    if (!disabled && inputRef.current) {
      // iOS zooms focused inputs with font-size < 16px; skip autofocus on touch devices.
      const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      if (!isTouch) {
        inputRef.current.focus();
      }
    }
  }, [disabled]);

  useEffect(() => {
    if (!value && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [value]);

  const uploadFile = async (file: File) => {
    if (!sessionId) {
      alert('Bitte warte, bis die Session geladen ist.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('sessionId', sessionId);
      const res = await fetch('/api/attachments', { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.hint || 'Upload fehlgeschlagen');

      const att: ChatAttachment = {
        id: crypto.randomUUID(),
        name: data.name || file.name,
        mimeType: data.mimeType || file.type,
        type: data.type === 'image' ? 'image' : 'document',
        url: data.url,
        base64: data.base64,
        textExtract: data.textExtract,
      };
      onAttachmentsChange([...attachments, att]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload fehlgeschlagen';
      alert(msg);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(a => a.id !== id));
  };

  return (
    <div className={`${compact ? 'p-2' : 'p-4'} bg-white ${compact ? '' : 'rounded-b-2xl'} border-t border-gray-100 shrink-0 w-full min-w-0`}>
      {backgroundStatus && !isStreaming && (
        <p className="flex items-center gap-2 text-xs text-indigo-600 font-medium mb-2 px-1">
          <Loader2 size={14} className="animate-spin shrink-0" />
          {backgroundStatus}
        </p>
      )}
      {allowAttachments && attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachments.map(a => {
            const preview = a.type === 'image' ? attachmentPreviewUrl(a) : undefined;
            return (
              <span
                key={a.id}
                className="relative inline-flex items-center bg-gray-100 rounded-xl overflow-hidden shrink-0"
              >
                {preview ? (
                  <img src={preview} alt="" className="w-14 h-14 object-cover" />
                ) : a.type === 'image' ? (
                  <span className="w-14 h-14 flex items-center justify-center text-gray-400">
                    <ImageIcon size={20} />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 px-3 py-2">
                    <FileText size={14} />
                    <span className="max-w-[100px] truncate">{a.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                  aria-label="Anhang entfernen"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative w-full min-w-0">
        {voiceError && (
          <p className="absolute bottom-full left-0 right-0 mb-1.5 flex items-center gap-2 text-xs text-red-600 bg-white/95 px-1 py-0.5 rounded-md shadow-sm z-10">
            <span className="flex-1 min-w-0">{voiceError}</span>
            <button
              type="button"
              onClick={clearVoiceError}
              className="text-red-400 hover:text-red-700 shrink-0"
              aria-label="Fehlermeldung schließen"
            >
              <X size={12} />
            </button>
          </p>
        )}
        <form
          onSubmit={onSubmit}
          className="flex w-full min-w-0 items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-3xl min-h-[52px]"
        >
          {allowAttachments && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploading || disabled}
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 flex shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 active:bg-gray-200 rounded-full transition-colors"
                aria-label="Datei oder Bild anhängen"
                title="Datei oder Bild anhängen"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={18} />}
              </button>
            </>
          )}

          <div className="flex-1 min-w-0 flex items-center">
            <textarea
              ref={inputRef}
              value={value}
              onChange={e => {
                onChange(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
              }}
              onPaste={e => {
                const items = e.clipboardData?.items;
                if (!allowAttachments || !items || uploading || disabled) return;
                for (const item of items) {
                  if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) void uploadFile(file);
                    return;
                  }
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isStreaming && (value.trim() || attachments.length) && !disabled && !uploading) {
                    onSubmit(e as unknown as FormEvent);
                  }
                }
              }}
              placeholder={
                voiceState === 'recording'
                  ? 'Sprich jetzt…'
                  : uploading
                    ? 'Wird hochgeladen…'
                    : 'Antworten…'
              }
              rows={1}
              disabled={voiceState === 'transcribing'}
              className="w-full bg-transparent px-1 py-1 focus:outline-none text-gray-800 text-base resize-none leading-relaxed disabled:opacity-60"
              style={{ minHeight: '24px', maxHeight: '150px' }}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={voiceDisabled || voiceState === 'transcribing'}
              onClick={toggleVoice}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                voiceState === 'recording'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 active:bg-gray-200'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              aria-label={
                voiceState === 'recording'
                  ? 'Aufnahme stoppen'
                  : voiceState === 'transcribing'
                    ? 'Sprache wird erkannt'
                    : 'Spracheingabe starten'
              }
              title={
                voiceState === 'recording'
                  ? 'Aufnahme stoppen — nochmal tippen'
                  : voiceState === 'transcribing'
                    ? 'Wird transkribiert…'
                    : 'Spracheingabe (Voxtral)'
              }
            >
              {voiceState === 'transcribing' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Mic size={18} className={voiceState === 'recording' ? 'animate-pulse' : undefined} />
              )}
            </button>
            <button
              type={isStreaming ? 'button' : 'submit'}
              disabled={!isStreaming && ((!value.trim() && !attachments.length) || disabled || uploading || voiceState !== 'idle')}
              onClick={isStreaming ? onStop : undefined}
              className="w-8 h-8 flex items-center justify-center bg-gray-900 text-white rounded-full hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isStreaming ? <Square fill="currentColor" size={14} /> : <ArrowUp size={16} strokeWidth={2.5} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
