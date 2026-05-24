import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { clsx } from 'clsx';
import { Bot, User, Edit2, Copy, ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { Message } from '@/lib/types';

export default function MessageBubble({ message, onEdit }: { message: Message, onEdit?: (id: string, newContent: string) => void }) {
  const { role, content, id } = message;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [isCopied, setIsCopied] = useState(false);
  const [thumbState, setThumbState] = useState<'up' | 'down' | null>(null);

  // Filtere <canvas_update> und <phase_complete> Tags heraus, damit sie im Chat unsichtbar sind
  const visibleContent = content.replace(/<canvas_update>[\s\S]*?(<\/canvas_update>|$)/g, '').replace(/<phase_complete>[\s\S]*?(<\/phase_complete>|$)/g, '').trim();

  // Wenn der Coach noch tippt (oder nur ein Update schickt), zeige Loading-Dots
  if (!visibleContent && role === 'assistant' && !content.includes('<canvas_update>') && !content.includes('<phase_complete>')) {
    return (
      <div className="flex gap-4 mb-6">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <Bot size={18} className="text-blue-600" />
        </div>
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 w-16 flex items-center justify-center">
          <span className="flex space-x-1">
             <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
             <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
             <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      </div>
    );
  }

  // Verstecke die Bubble komplett, wenn es keine sichtbaren Inhalte gibt (nach dem Parsing)
  if (!visibleContent) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(visibleContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (onEdit && editValue.trim() && editValue !== content) {
      onEdit(id, editValue);
    }
    setIsEditing(false);
  };

  return (
    <div className={clsx("flex gap-4 mb-6 group", role === 'user' ? "flex-row-reverse" : "flex-row")}>
      <div className={clsx(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
        role === 'user' ? "bg-indigo-600 text-white" : "bg-blue-100 text-blue-600"
      )}>
        {role === 'user' ? <User size={18} /> : <Bot size={18} />}
      </div>
      
      <div className={clsx("flex flex-col max-w-[80%]", role === 'user' ? "items-end" : "items-start")}>
        <div className={clsx(
          "rounded-2xl px-5 py-3 relative",
          role === 'user' ? "bg-indigo-600 text-white" : "bg-white border border-gray-100 text-gray-800 shadow-sm"
        )}>
          {role === 'user' && !isEditing && (
            <button 
              onClick={() => { setIsEditing(true); setEditValue(content); }}
              className="absolute -left-10 top-2 p-1.5 text-gray-400 hover:text-indigo-600 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-gray-100"
              title="Nachricht bearbeiten"
            >
              <Edit2 size={14} />
            </button>
          )}

          {isEditing ? (
            <div className="flex flex-col gap-2 min-w-[250px]">
              <textarea 
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                className="w-full bg-indigo-700 text-white rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm resize-none"
                rows={3}
              />
              <div className="flex justify-end gap-2 mt-1">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 text-xs rounded-md bg-indigo-500 hover:bg-indigo-400 transition-colors"
                >
                  Abbrechen
                </button>
                <button 
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-xs rounded-md bg-white text-indigo-600 hover:bg-gray-100 transition-colors font-medium"
                >
                  Senden & Ändern
                </button>
              </div>
            </div>
          ) : (
            <div 
              className={clsx("prose prose-sm max-w-none", role === 'user' ? "prose-invert" : "")}
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
            >
              <ReactMarkdown>{visibleContent}</ReactMarkdown>
            </div>
          )}
        </div>

        {role === 'assistant' && (
          <div className="flex items-center gap-2 mt-2 px-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleCopy} className="p-1 hover:text-gray-700 transition-colors rounded-md hover:bg-gray-100" title="Kopieren">
              {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
            <button 
              onClick={() => setThumbState(prev => prev === 'up' ? null : 'up')} 
              className={clsx("p-1 transition-colors rounded-md hover:bg-gray-100", thumbState === 'up' ? "text-indigo-600" : "hover:text-gray-700")} 
              title="Gute Antwort"
            >
              <ThumbsUp size={14} />
            </button>
            <button 
              onClick={() => setThumbState(prev => prev === 'down' ? null : 'down')} 
              className={clsx("p-1 transition-colors rounded-md hover:bg-gray-100", thumbState === 'down' ? "text-red-500" : "hover:text-gray-700")} 
              title="Schlechte Antwort"
            >
              <ThumbsDown size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
