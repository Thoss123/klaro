import React from 'react';
import { CanvasData } from '@/lib/types';
import PainPointCard from './PainPointCard';
import UseCaseCard from './UseCaseCard';
import DocumentCard from './DocumentCard';
import { Check, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

export default function CanvasPanel({ data }: { data: CanvasData }) {
  const isEmpty = data.pain_points.length === 0 && data.use_cases.length === 0 && (!data.documents || data.documents.length === 0);

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-gray-400">
        <div className="text-center">
          <p className="font-semibold mb-2 text-xl text-gray-300">Dein Canvas ist noch leer.</p>
          <p className="text-sm">Antworte im Chat, um die Roadmap aufzubauen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-start pb-40 gap-16 relative w-full max-w-2xl">
      {/* Central Line connecting everything */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px border-dashed border-l-2 border-gray-300 z-0 opacity-50"></div>

      {data.pain_points.map((pp, i) => (
        <motion.div 
          key={pp.id || i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-[420px]"
        >
          <PainPointCard point={pp} />
        </motion.div>
      ))}

      {data.use_cases.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-24 h-24 rounded-full bg-blue-50 border-[6px] border-blue-100 flex items-center justify-center shadow-sm"
        >
           <Check size={40} strokeWidth={3} className="text-blue-400" />
        </motion.div>
      )}

      {data.use_cases.map((uc, i) => (
        <motion.div 
          key={uc.id || i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-[420px]"
        >
          <UseCaseCard useCase={uc} />
        </motion.div>
      ))}

      {data.documents && data.documents.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-24 h-24 rounded-full bg-blue-50 border-[6px] border-blue-100 flex items-center justify-center shadow-sm"
        >
           <FileText size={40} strokeWidth={3} className="text-blue-400" />
        </motion.div>
      )}

      {data.documents && data.documents.map((doc, i) => (
        <motion.div 
          key={doc.id || i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-[420px]"
        >
          <DocumentCard document={doc} />
        </motion.div>
      ))}
    </div>
  );
}
