import React, { FormEvent, useRef, useEffect, useState } from 'react';
import { ArrowUp, Loader2, Paperclip, FileText, Image as ImageIcon, Square } from 'lucide-react';

export default function ChatInput({ 
  value, 
  onChange, 
  onSubmit, 
  disabled,
  isStreaming,
  onStop
}: { 
  value: string, 
  onChange: (s: string) => void, 
  onSubmit: (e: FormEvent) => void, 
  disabled: boolean,
  isStreaming?: boolean,
  onStop?: () => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  useEffect(() => {
    if (!value && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [value]);

  return (
    <div className="p-4 bg-white rounded-b-2xl">
      <form onSubmit={onSubmit} className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-3xl relative min-h-[52px]">
        <button 
          type="button" 
          onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
          className="w-8 h-8 flex shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 active:bg-gray-200 rounded-full transition-colors self-end mb-0.5"
        >
          <Paperclip size={18} />
        </button>
        
        {isFileMenuOpen && (
          <div className="absolute bottom-12 left-0 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
            <button type="button" className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => setIsFileMenuOpen(false)}>
              <FileText size={16} /> Dokument hochladen
            </button>
            <button type="button" className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => setIsFileMenuOpen(false)}>
              <ImageIcon size={16} /> Bild hochladen
            </button>
          </div>
        )}

        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isStreaming && value.trim() && !disabled) {
                onSubmit(e as any);
              }
            }
          }}
          placeholder="Antworten..."
          rows={1}
          className="flex-1 bg-transparent px-2 py-1 focus:outline-none text-gray-800 text-sm resize-none self-center leading-relaxed"
          style={{ minHeight: '24px', maxHeight: '150px' }}
        />
        <button
          type={isStreaming ? "button" : "submit"}
          disabled={!isStreaming && (!value.trim() || disabled)}
          onClick={isStreaming ? onStop : undefined}
          className="w-8 h-8 flex shrink-0 items-center justify-center bg-gray-500 text-white rounded-full hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors self-end mb-0.5"
        >
          {isStreaming ? <Square fill="currentColor" size={14} /> : (disabled ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} strokeWidth={2.5} />)}
        </button>
      </form>
    </div>
  );
}
