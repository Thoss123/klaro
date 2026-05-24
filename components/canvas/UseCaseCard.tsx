import React from 'react';
import { UseCase } from '@/lib/types';

export default function UseCaseCard({ useCase }: { useCase: UseCase }) {
  return (
    <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col items-center text-center">
      <h3 className="font-bold text-gray-800 text-lg mb-3 leading-tight">{useCase.title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed mb-0">{useCase.linked_pain_point}</p>
    </div>
  );
}
