import React from 'react';
import { CanvasDocument } from '@/lib/types';
import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function DocumentCard({ document }: { document: CanvasDocument }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="bg-blue-50/50 border-b border-gray-100 px-5 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
          <FileText size={18} />
        </div>
        <h3 className="font-bold text-gray-900">{document.title}</h3>
      </div>
      <div className="p-5 prose prose-sm max-w-none text-gray-600">
        <ReactMarkdown>{document.content}</ReactMarkdown>
      </div>
    </div>
  );
}
