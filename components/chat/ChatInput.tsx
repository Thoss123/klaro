import React, { FormEvent, useRef, useEffect, useState } from 'react';
import { ArrowUp, Loader2, Paperclip, FileText, Image as ImageIcon, Square, X } from 'lucide-react';
import type { ChatAttachment } from '@/lib/chat-attachments';

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
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      setIsFileMenuOpen(false);
    }
  };

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(a => a.id !== id));
  };

  return (
    <div className={`${compact ? 'p-2' : 'p-4'} bg-white ${compact ? '' : 'rounded-b-2xl'} border-t border-gray-100 shrink-0`}>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachments.map(a => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full"
            >
              {a.type === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Anhang entfernen"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={onSubmit} className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-3xl relative min-h-[52px]">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".txt,.md,.csv,.json,text/*,application/pdf"
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
          onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
          className="w-8 h-8 flex shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 active:bg-gray-200 rounded-full transition-colors self-end mb-0.5"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={18} />}
        </button>

        {isFileMenuOpen && (
          <div className="absolute bottom-12 left-0 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              onClick={() => docInputRef.current?.click()}
            >
              <FileText size={16} /> Dokument (.txt, .md, .csv)
            </button>
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon size={16} /> Bild hochladen
            </button>
          </div>
        )}

        <textarea
          ref={inputRef}
          value={value}
          onChange={e => {
            onChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isStreaming && (value.trim() || attachments.length) && !disabled && !uploading) {
                onSubmit(e as unknown as FormEvent);
              }
            }
          }}
          placeholder="Antworten..."
          rows={1}
          className="flex-1 bg-transparent px-2 py-1 focus:outline-none text-gray-800 text-base resize-none self-center leading-relaxed"
          style={{ minHeight: '24px', maxHeight: '150px' }}
        />
        <button
          type={isStreaming ? 'button' : 'submit'}
          disabled={!isStreaming && ((!value.trim() && !attachments.length) || disabled || uploading)}
          onClick={isStreaming ? onStop : undefined}
          className="w-8 h-8 flex shrink-0 items-center justify-center bg-gray-900 text-white rounded-full hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors self-end mb-0.5"
        >
          {isStreaming ? <Square fill="currentColor" size={14} /> : <ArrowUp size={16} strokeWidth={2.5} />}
        </button>
      </form>
    </div>
  );
}
