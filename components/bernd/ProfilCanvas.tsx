"use client";

import React from 'react';
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Building2,
  ListTodo,
  Target,
  ShieldCheck,
  Sparkles,
  Compass,
  MessageSquareQuote,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardHeader } from '@/components/bernd/ui';
import { evaluateGate } from '@/lib/bernd/gate';
import { SCOPE_LABELS, SETUP_SCOPE_IDS } from '@/lib/bernd/scopes';
import type { BerndSetupState, ScopeStatus } from '@/lib/bernd/types';

/**
 * Lebendes Profil (rechte Spalte, WP3 Aufgabe 2): wächst live mit Bernds Steuer-Tags mit
 * (`setup_state`). Rein lesend — keine Interaktion in v1, siehe Architekturplan §WP3.
 */

interface ProfilCanvasProps {
  state: BerndSetupState;
  emailConnected: boolean;
  telegramConnected: boolean;
}

const PROFIL_LABELS: Record<string, string> = {
  gewerk: 'Gewerk',
  firmenname: 'Firma',
  mitarbeiter: 'Mitarbeiter',
  standort: 'Standort',
  ton: 'Ton',
};

const FORTSCHRITT_LABELS: Record<string, string> = {
  betrieb: 'Betrieb',
  aufgaben: 'Aufgaben',
  wissen: 'Wissen',
  regeln: 'Regeln',
};

const SCOPE_STATUS_STYLE: Record<ScopeStatus, string> = {
  gewaehlt: 'text-slate-800',
  vorgeschlagen: 'text-slate-400',
  abgelehnt: 'text-slate-300 line-through',
};

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader icon={Icon} title={title} subtitle={subtitle} />
      <div className="p-4">{children}</div>
    </Card>
  );
}

export function ProfilCanvas({ state, emailConnected, telegramConnected }: ProfilCanvasProps) {
  const gate = evaluateGate({ setupState: state, emailConnected, telegramConnected });
  const pflichtItems = gate.items.filter((item) => item.pflicht);
  const optionalItems = gate.items.filter((item) => !item.pflicht);

  const profil = state.profil ?? {};
  const profilEintraege = Object.entries(profil).filter(([, value]) => value?.trim());

  const fortschritt = state.fortschritt ?? {};
  const fortschrittEintraege = Object.entries(fortschritt).filter(([, wert]) => typeof wert === 'number');

  const scopes = state.scopes ?? [];
  const scopeById = new Map(scopes.map((scope) => [scope.id, scope]));
  const hatAufgaben = scopes.length > 0;

  const gewaehlteScopeIds = scopes.filter((s) => s.status === 'gewaehlt').map((s) => s.id);
  const ablauf = state.ablauf ?? {};
  const ablaufEintraege = gewaehlteScopeIds
    .map((id) => ({ id, fragen: Object.entries(ablauf[id] ?? {}) }))
    .filter((e) => e.fragen.length > 0);

  const ziele = state.ziele ?? [];
  const regeln = state.regeln ?? [];
  const zukunft = state.zukunft ?? [];
  const einschaetzung = Object.entries(state.einschaetzung ?? {}).filter(([, text]) => text?.trim());

  return (
    <div className="flex flex-col gap-5">
      {/* Bereit zum Start */}
      <Card>
        <CardHeader
          icon={ClipboardCheck}
          title="Bereit zum Start"
          subtitle={gate.canStart ? 'Alle Pflichtpunkte erfüllt' : `Noch ${gate.missing.length} offen`}
        />
        <div className="flex flex-col gap-2 p-4">
          {pflichtItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2.5 text-sm">
              {item.done ? (
                <CheckCircle2 size={17} className="shrink-0 text-emerald-500" />
              ) : (
                <Circle size={17} className="shrink-0 text-slate-300" />
              )}
              <span className={item.done ? 'text-slate-700' : 'text-slate-500'}>{item.label}</span>
            </div>
          ))}

          {optionalItems.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Macht Bernd besser
              </p>
              {optionalItems.map((item) => (
                <div key={item.key} className="flex items-center gap-2.5 text-sm">
                  {item.done ? (
                    <CheckCircle2 size={17} className="shrink-0 text-indigo-400" />
                  ) : (
                    <Circle size={17} className="shrink-0 text-slate-200" />
                  )}
                  <span className={item.done ? 'text-slate-600' : 'text-slate-400'}>{item.label}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </Card>

      {/* Fortschritt */}
      {fortschrittEintraege.length > 0 && (
        <SectionCard icon={Compass} title="Fortschritt">
          <div className="flex flex-col gap-3">
            {fortschrittEintraege.map(([key, wert]) => (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{FORTSCHRITT_LABELS[key] ?? key}</span>
                  <span className="text-slate-400">{wert}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, wert as number))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Betrieb */}
      {profilEintraege.length > 0 && (
        <SectionCard icon={Building2} title="Betrieb">
          <dl className="flex flex-col gap-1.5 text-sm">
            {profilEintraege.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="text-slate-400">{PROFIL_LABELS[key] ?? key}</dt>
                <dd className="text-right font-medium text-slate-700">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}

      {/* Bernds Aufgaben */}
      {hatAufgaben && (
        <SectionCard icon={ListTodo} title="Bernds Aufgaben">
          <ul className="flex flex-col gap-2">
            {SETUP_SCOPE_IDS.filter((id) => scopeById.has(id)).map((id) => {
              const scope = scopeById.get(id)!;
              return (
                <li key={id} className={`flex items-center gap-2 text-sm ${SCOPE_STATUS_STYLE[scope.status]}`}>
                  {scope.status === 'gewaehlt' ? (
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                  ) : (
                    <Circle size={15} className="shrink-0 text-slate-300" />
                  )}
                  <span>{SCOPE_LABELS[id] ?? id}</span>
                  {scope.status === 'vorgeschlagen' && <span className="text-xs">(vorgeschlagen)</span>}
                </li>
              );
            })}
          </ul>

          {ablaufEintraege.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3">
              {ablaufEintraege.map(({ id, fragen }) => (
                <div key={id}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {SCOPE_LABELS[id] ?? id} — Ablauf
                  </p>
                  <dl className="flex flex-col gap-1 text-sm">
                    {fragen.map(([frage, antwort]) => (
                      <div key={frage} className="flex justify-between gap-3">
                        <dt className="text-slate-400">{frage}</dt>
                        <dd className="text-right font-medium text-slate-700">{antwort}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Ziele */}
      {ziele.length > 0 && (
        <SectionCard icon={Target} title="Ziele">
          <ul className="flex flex-col gap-1.5">
            {ziele.map((ziel, i) => (
              <li key={i} className="text-sm text-slate-700">
                {ziel}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Regeln */}
      {regeln.length > 0 && (
        <SectionCard icon={ShieldCheck} title="Regeln">
          <ul className="flex flex-col gap-1.5">
            {regeln.map((regel, i) => (
              <li key={i} className="text-sm text-slate-700">
                {regel}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Später möglich */}
      {zukunft.length > 0 && (
        <SectionCard icon={Sparkles} title="Später möglich">
          <ul className="flex flex-col gap-1.5">
            {zukunft.map((idee, i) => (
              <li key={i} className="text-sm text-slate-500">
                {idee}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Bernds Einschätzung */}
      {einschaetzung.length > 0 && (
        <SectionCard icon={MessageSquareQuote} title="Bernds Einschätzung">
          <div className="flex flex-col gap-2.5">
            {einschaetzung.map(([feld, text]) => (
              <p key={feld} className="text-sm leading-relaxed text-slate-600">
                {text}
              </p>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
