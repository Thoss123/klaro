import React from 'react';
import { PainPoint } from '@/lib/types';

export default function PainPointCard({ point }: { point: PainPoint }) {
  return (
    <div className="bg-[#eef6fc] rounded-2xl p-6 border border-blue-100 shadow-sm flex flex-col w-full text-left">
      <div className="text-center mb-4">
        <h3 className="font-bold text-gray-800 text-lg mb-2 leading-tight">{point.title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-0">{point.description}</p>
      </div>

      {point.details && Object.keys(point.details).length > 0 && (
        <div className="mt-2 pt-4 border-t border-blue-200/50 flex flex-col gap-2 w-full">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Details</div>
          {Object.entries(point.details).map(([key, value]) => (
            <div key={key} className="bg-white/60 rounded-lg p-3 text-sm border border-blue-100/50">
              <span className="font-bold text-gray-700 capitalize mb-1 block">{key.replace(/_/g, ' ')}</span>
              <span className="text-gray-600">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
