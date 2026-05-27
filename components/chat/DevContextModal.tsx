import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, MessageSquare, Activity } from 'lucide-react';
import { Message } from '@/lib/types';

interface DevContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: string;
  messages: Message[];
}

export default function DevContextModal({ isOpen, onClose, memory, messages }: DevContextModalProps) {
  if (!isOpen) return null;

  const messagesJson = JSON.stringify(messages, null, 2);
  const totalChars = memory.length + messagesJson.length;
  // Genaue Token-Zahlen hängen vom Tokenizer ab, aber ~4 Zeichen pro Token ist eine Standard-Faustregel
  const estimatedTokens = Math.ceil(totalChars / 4);
  
  // Cost estimation: Mistral Large costs approx €2 per 1M input tokens
  const estimatedCost = (estimatedTokens / 1000000) * 2.0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Database size={20} className="text-slate-500" />
              Developer Context
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            
            {/* Stats Card */}
            <div className="grid grid-cols-3 gap-4">
               <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1">
                 <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                   <Activity size={14} /> Est. Tokens
                 </div>
                 <div className="text-2xl font-black text-indigo-600">{estimatedTokens.toLocaleString()}</div>
               </div>
               <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1">
                 <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                   <MessageSquare size={14} /> Messages
                 </div>
                 <div className="text-2xl font-black text-slate-700">{messages.length}</div>
               </div>
               <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1">
                 <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                   <Database size={14} /> Est. Cost (Mistral Large)
                 </div>
                 <div className="text-2xl font-black text-emerald-600">€{estimatedCost.toFixed(4)}</div>
               </div>
            </div>

            {/* Memory Section */}
            <div>
               <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Injected Memory</h3>
               <div className="bg-slate-900 text-green-400 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap overflow-x-auto">
                 {memory || 'Keine Memory vorhanden.'}
               </div>
            </div>

            {/* Messages Section */}
            <div>
               <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Raw Message History</h3>
               <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-96">
                 {messagesJson}
               </div>
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
