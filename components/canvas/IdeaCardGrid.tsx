import React from 'react';
import type { IdeaCard } from '@/lib/types';
import { Sparkles, Check } from 'lucide-react';

/**
 * Ideen-Karten „Was KI hier kann" (Phase 1) — vom Coach aufs Canvas gelegt,
 * gruppiert nach Geschäftsbereich (wie die Landingpage-Flow-Karten). Klick
 * schickt eine Chat-Nachricht, mit der der Coach den Bereich vertieft.
 */
export default function IdeaCardGrid({
  cards,
  onCardClick,
}: {
  cards: IdeaCard[];
  onCardClick?: (card: IdeaCard) => void;
}) {
  const byArea = new Map<string, IdeaCard[]>();
  for (const card of cards) {
    const area = card.area || 'Weitere Ideen';
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area)!.push(card);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...byArea.entries()].map(([area, areaCards]) => (
        <div key={area}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-2">
            {area}
          </div>
          <div className="flex flex-col gap-2">
            {areaCards.map(card => (
              <IdeaCardItem key={card.id} card={card} onClick={onCardClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IdeaCardItem({
  card,
  onClick,
}: {
  card: IdeaCard;
  onClick?: (card: IdeaCard) => void;
}) {
  const dismissed = card.status === 'dismissed';
  const interested = card.status === 'interested';
  const clickable = !!onClick && !dismissed;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? () => onClick(card) : undefined}
      className={`rounded-lg border p-3.5 shadow-sm text-sm text-left w-full transition-all
        ${dismissed
          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-default'
          : interested
            ? 'border-indigo-300 bg-indigo-50/60 hover:shadow-md'
            : 'border-indigo-100 bg-white hover:border-indigo-300 hover:shadow-md'}`}
    >
      <div className="flex items-start gap-2.5 mb-1.5">
        <span className="mt-0.5 shrink-0">
          {interested
            ? <Check size={15} className="text-indigo-600" strokeWidth={3} />
            : <Sparkles size={15} className="text-indigo-400" />}
        </span>
        <p className={`font-semibold leading-snug text-sm ${dismissed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {card.title}
        </p>
      </div>
      {card.description && (
        <p className="text-gray-600 text-xs leading-relaxed pl-0.5">{card.description}</p>
      )}
      {card.flow && (
        <p className="mt-2 text-[11px] leading-relaxed text-indigo-700/80 bg-indigo-50/70 rounded px-2 py-1">
          {card.flow}
        </p>
      )}
      {clickable && !interested && (
        <span className="text-xs font-medium text-indigo-600 mt-2 inline-block">
          Mehr dazu erfahren →
        </span>
      )}
    </button>
  );
}
