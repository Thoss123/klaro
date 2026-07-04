import React, { useState } from 'react';
import type { ToolEvaluation } from '@/lib/types';
import { Star, Plus, Minus } from 'lucide-react';

/**
 * Tool-Bewertung (gemergte Phase 2): mögliches Zusatz-Tool mit Logo,
 * Sterne-Rating, Pro/Contra und Monatskosten — vom Coach per canvas_update gelegt.
 */
export default function ToolEvaluationCard({ evaluation }: { evaluation: ToolEvaluation }) {
  return (
    <div className="rounded-lg border border-violet-100 bg-white p-3.5 shadow-sm text-sm">
      <div className="flex items-center gap-2.5 mb-2">
        <ToolLogo name={evaluation.tool_name} domain={evaluation.logo_domain} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 leading-snug text-sm truncate">
            {evaluation.tool_name}
          </p>
          {typeof evaluation.rating === 'number' && <StarRow rating={evaluation.rating} />}
        </div>
        {evaluation.cost_monthly && (
          <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
            {evaluation.cost_monthly}
          </span>
        )}
      </div>

      {(evaluation.pros.length > 0 || evaluation.cons.length > 0) && (
        <div className="grid grid-cols-1 min-[280px]:grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 mb-1">
          <ul className="space-y-1">
            {evaluation.pros.map((p, i) => (
              <li key={i} className="flex gap-1.5">
                <Plus size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-1">
            {evaluation.cons.map((c, i) => (
              <li key={i} className="flex gap-1.5">
                <Minus size={12} className="mt-0.5 shrink-0 text-rose-400" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.verdict && (
        <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-2 mt-2">
          {evaluation.verdict}
        </p>
      )}
    </div>
  );
}

function StarRow({ rating }: { rating: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <span className="flex items-center gap-0.5 mt-0.5" title={`${filled} von 5 Sternen`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < filled ? 'text-amber-400' : 'text-gray-200'}
          fill={i < filled ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

/** Favicon des Anbieters; fällt auf einen Buchstaben-Kreis zurück. */
function ToolLogo({ name, domain }: { name: string; domain?: string }) {
  const [failed, setFailed] = useState(false);
  if (domain && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- externes Favicon, next/image bräuchte remotePatterns je Domain
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 shrink-0 rounded-md border border-gray-100 bg-white object-contain p-0.5"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-violet-100 text-xs font-bold text-violet-700">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
