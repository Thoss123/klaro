"use client";

import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Geteiltes UI-Fundament fürs Bernd-Dashboard — hält den Look über alle Bereiche
 * (Steckbrief, Wissen, Änderungs-Chat, Logs) konsistent: weiche, geschichtete Tiefe,
 * ruhige Indigo-Akzente, klare Hierarchie. Bewusst schlicht gehalten (Usability first).
 */

/** Weiche, geschichtete Karten-Schatten (dezente Tiefe statt harter Border). */
export const CARD_SHADOW =
  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_-18px_rgba(15,23,42,0.16)]';

export function Card({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200/70 bg-white ${CARD_SHADOW} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon size={17} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon size={22} />
        </span>
      )}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed text-slate-400">{hint}</p>}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

const DOT_COLOR: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  slate: 'bg-slate-300',
  indigo: 'bg-indigo-500',
};

/** Status-Punkt; `pulse` legt einen sanft pulsierenden Ring darum (für „läuft gerade"). */
export function StatusDot({
  color,
  pulse = false,
}: {
  color: 'green' | 'amber' | 'red' | 'slate' | 'indigo';
  pulse?: boolean;
}) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT_COLOR[color]}`}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT_COLOR[color]}`} />
    </span>
  );
}

const PILL_TONE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  red: 'bg-red-50 text-red-700 ring-red-600/10',
  slate: 'bg-slate-100 text-slate-500 ring-slate-500/10',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/10',
};

export function Pill({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'green' | 'amber' | 'red' | 'slate' | 'indigo';
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${PILL_TONE[tone]}`}
    >
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}

/** Primärer Button im Bernd-Look (weicher Indigo-Verlauf, dezenter farbiger Schatten). */
export const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:from-indigo-500 hover:to-indigo-700 hover:shadow-indigo-600/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
