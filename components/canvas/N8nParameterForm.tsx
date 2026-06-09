"use client";

/**
 * Generic n8n parameter form — rendert properties[] aus nodes.json,
 * inkl. der komplexen Typen: collection, fixedCollection, resourceLocator, notice, color.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { N8nCredentialTypeDescription, N8nNodeProperty, N8nNodeTypeDescription, N8nPropertyOption } from '@/lib/n8n-catalog-types';
import { dedupePropertyOptions, hasLoadOptions, resolveStaticOptions } from '@/lib/n8n-static-options';
import type { IoField } from '@/lib/workflow-io';
import {
  getVisibleProperties,
  isPropertyVisible,
  mergeParameters,
  iconUrlFromRef,
} from '@/lib/n8n-parameter-utils';
import N8nCredentialSelect from './N8nCredentialSelect';

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400';
const selectCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400';

/* eslint-disable @typescript-eslint/no-explicit-any */

function usePropertyOptions(
  nodeType: string,
  prop: N8nNodeProperty,
  parameters: Record<string, unknown>,
  credentialId?: string,
): N8nPropertyOption[] {
  const [dynamic, setDynamic] = useState<N8nPropertyOption[]>([]);
  const staticOpts = useMemo(
    () => (prop.options?.length ? prop.options : resolveStaticOptions(nodeType, prop.name)),
    [nodeType, prop.name, prop.options],
  );
  const needsFetch = hasLoadOptions(prop);

  const fetchOptions = useCallback(async () => {
    if (!needsFetch) return;
    try {
      const res = await fetch('/api/n8n/load-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeType, propertyName: prop.name, parameters, credentialId }),
      });
      if (res.ok) {
        const data = await res.json() as { options?: N8nPropertyOption[] };
        if (data.options?.length) { setDynamic(data.options); return; }
      }
    } catch { /* static fallback */ }
    setDynamic(staticOpts);
  }, [needsFetch, nodeType, prop.name, parameters, credentialId, staticOpts]);

  useEffect(() => {
    if (prop.options?.length) { setDynamic([]); return; }
    if (needsFetch) fetchOptions();
    else setDynamic(staticOpts);
  }, [prop.options, needsFetch, fetchOptions, staticOpts]);

  if (prop.options?.length) return dedupePropertyOptions(prop.options);
  if (dynamic.length) return dedupePropertyOptions(dynamic);
  return dedupePropertyOptions(staticOpts);
}

function OptionsField({ nodeType, prop, value, parameters, credentialId, onChange }: {
  nodeType: string; prop: N8nNodeProperty; value: unknown;
  parameters: Record<string, unknown>; credentialId?: string; onChange: (v: string) => void;
}) {
  const options = usePropertyOptions(nodeType, prop, parameters, credentialId);
  const current = String(value ?? prop.default ?? '');
  if (!options.length) {
    return <input type="text" value={current} placeholder={prop.placeholder || `${prop.displayName} eingeben…`} onChange={e => onChange(e.target.value)} className={inputCls} />;
  }
  const inList = options.some(o => String(o.value) === current);
  const selectValue = inList ? current : String(options[0]?.value ?? current);
  return (
    <select value={selectValue} onChange={e => onChange(e.target.value)} className={selectCls}>
      {!inList && current && <option value={current}>{current} (aktuell)</option>}
      {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.name}</option>)}
    </select>
  );
}

/**
 * resourceLocator — Modus-Auswahl (From list / By URL / By ID) + Wert.
 * Im "list"-Modus werden die Optionen live über /api/n8n/load-options geladen
 * (z. B. Airtable Bases/Tables) — dafür ist ein ausgewähltes Credential nötig.
 */
function ResourceLocatorField({ nodeType, prop, value, parameters, credentialId, onChange }: {
  nodeType: string; prop: N8nNodeProperty; value: unknown;
  parameters: Record<string, unknown>; credentialId?: string; onChange: (v: unknown) => void;
}) {
  const p = prop as any;
  const modes: any[] = p.modes || [];
  const rl = (value && typeof value === 'object' ? value : {}) as any;
  const mode: string = rl.mode || modes[0]?.name || 'id';
  const isListMode = mode === 'list';

  const [options, setOptions] = useState<N8nPropertyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Aktuelle Parameter für den Fetch-Body bereithalten, ohne dass jede
  // Texteingabe in Geschwister-Feldern einen Re-Fetch auslöst.
  const paramsRef = useRef(parameters);
  paramsRef.current = parameters;

  // Re-Fetch nur, wenn sich ein anderer resourceLocator-Wert ändert
  // (z. B. Airtable: Tabellen-Liste hängt von der gewählten Base ab).
  const siblingLocatorKey = JSON.stringify(
    Object.entries(parameters)
      .filter(([k, v]) => k !== prop.name && v && typeof v === 'object' && (v as any).__rl)
      .map(([k, v]) => [k, (v as any).value]),
  );

  useEffect(() => {
    if (!isListMode || !credentialId) { setOptions([]); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch('/api/n8n/load-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeType, propertyName: prop.name, parameters: paramsRef.current, credentialId }),
    })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { options?: N8nPropertyOption[] };
        if (!cancelled) setOptions(data.options ?? []);
      })
      .catch(() => { if (!cancelled) { setOptions([]); setLoadError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListMode, nodeType, prop.name, credentialId, siblingLocatorKey]);

  const setMode = (m: string) => onChange({ __rl: true, mode: m, value: rl.value ?? '' });
  const current = String(rl.value ?? '');
  const inList = options.some(o => String(o.value) === current);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        {modes.length > 0 && (
          <select value={mode} onChange={e => setMode(e.target.value)} className={`${selectCls} max-w-[40%]`}>
            {modes.map(m => <option key={m.name} value={m.name}>{m.displayName || m.name}</option>)}
          </select>
        )}
        {isListMode && options.length > 0 ? (
          <select
            value={inList ? current : ''}
            onChange={e => {
              const opt = options.find(o => String(o.value) === e.target.value);
              onChange({ __rl: true, mode: 'list', value: e.target.value, cachedResultName: opt?.name });
            }}
            className={selectCls}
          >
            <option value="" disabled>Auswählen…</option>
            {!inList && current && <option value={current}>{rl.cachedResultName || current} (aktuell)</option>}
            {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.name}</option>)}
          </select>
        ) : (
          <input type="text" value={current}
            placeholder={isListMode
              ? (loading ? 'Liste wird geladen…' : !credentialId ? 'Erst Zugangsdaten auswählen' : 'Keine Liste verfügbar — Wert eingeben…')
              : (modes.find(m => m.name === mode)?.placeholder || 'Wert…')}
            disabled={isListMode && loading}
            onChange={e => onChange({ __rl: true, mode, value: e.target.value })} className={inputCls} />
        )}
      </div>
      {isListMode && !credentialId && (
        <p className="text-[11px] text-amber-600">Wähle oben zuerst Zugangsdaten aus, damit die Liste geladen werden kann.</p>
      )}
      {isListMode && loadError && (
        <p className="text-[11px] text-red-500">Liste konnte nicht geladen werden — du kannst die ID auch direkt eintragen.</p>
      )}
    </div>
  );
}

/** Ein einzelnes n8n-Feld (rekursiv für collection/fixedCollection). */
function ParamField({ nodeType, prop, value, siblings, credentialId, onChange, onFocusName }: {
  nodeType: string;
  prop: N8nNodeProperty;
  value: unknown;
  siblings: Record<string, unknown>;
  credentialId?: string;
  onChange: (v: unknown) => void;
  onFocusName?: (name: string, cursorPos?: number) => void;
}) {
  const focusProps = onFocusName ? { 
    onFocus: (e: any) => onFocusName(prop.name, e.target.selectionStart),
    onClick: (e: any) => onFocusName(prop.name, e.target.selectionStart),
    onKeyUp: (e: any) => onFocusName(prop.name, e.target.selectionStart),
  } : {};
  const isExpr = typeof value === 'string' && value.startsWith('=');
  const p = prop as any;
  const type = prop.type;

  // notice — reiner Hinweistext
  if (type === 'notice') {
    return <p className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">{prop.displayName}</p>;
  }

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} className="rounded border-gray-300" />
        {prop.displayName}
      </label>
    );
  }

  if (type === 'number') {
    // Expression-Modus (Wert beginnt mit '=') → als Text bearbeiten, sonst Zahl.
    if (isExpr) {
      return <input type="text" value={String(value)} {...focusProps} onChange={e => onChange(e.target.value)} className={`${inputCls} font-mono text-violet-700`} />;
    }
    return <input type="number" value={value != null ? String(value) : ''} placeholder={prop.placeholder} {...focusProps} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={inputCls} />;
  }

  if (type === 'color') {
    return <input type="color" value={String(value ?? prop.default ?? '#000000')} onChange={e => onChange(e.target.value)} className="h-9 w-16 rounded border border-gray-200 bg-white p-0.5" />;
  }

  if (type === 'options') {
    return <OptionsField nodeType={nodeType} prop={prop} value={value} parameters={siblings} credentialId={credentialId} onChange={onChange} />;
  }

  if (type === 'multiOptions') {
    return (
      <select multiple value={Array.isArray(value) ? (value as string[]).map(String) : []}
        onChange={e => onChange(Array.from(e.target.selectedOptions).map(o => o.value))}
        className={`${inputCls} min-h-[80px]`}>
        {(prop.options || []).map(o => <option key={String(o.value)} value={String(o.value)}>{o.name}</option>)}
      </select>
    );
  }

  // resourceLocator — Modus-Auswahl (From list / By URL / By ID) + Wert
  if (type === 'resourceLocator') {
    return <ResourceLocatorField nodeType={nodeType} prop={prop} value={value} parameters={siblings} credentialId={credentialId} onChange={onChange} />;
  }

  // collection — Gruppe optionaler Felder (alle inline anzeigen)
  if (type === 'collection') {
    const subProps: N8nNodeProperty[] = (p.options || []) as N8nNodeProperty[];
    const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    return (
      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
        {subProps.map(sp => (
          <FieldRow key={sp.name} nodeType={nodeType} prop={sp} value={obj[sp.name]} siblings={obj} credentialId={credentialId}
            onChange={v => onChange({ ...obj, [sp.name]: v })} />
        ))}
      </div>
    );
  }

  // fixedCollection — benannte Abschnitte mit Wiederholungen
  if (type === 'fixedCollection') {
    const sections: any[] = (p.options || []) as any[];
    const multiple = !!(prop.typeOptions as any)?.multipleValues;
    const val = (value && typeof value === 'object' ? value : {}) as Record<string, any>;
    return (
      <div className="space-y-3">
        {sections.map(section => {
          const entries: any[] = multiple ? (Array.isArray(val[section.name]) ? val[section.name] : []) : (val[section.name] ? [val[section.name]] : []);
          const fields: N8nNodeProperty[] = section.values || [];
          const writeEntry = (idx: number, entry: any) => {
            if (multiple) {
              const next = [...entries]; next[idx] = entry;
              onChange({ ...val, [section.name]: next });
            } else {
              onChange({ ...val, [section.name]: entry });
            }
          };
          const addEntry = () => {
            const blank: Record<string, unknown> = {};
            for (const f of fields) blank[f.name] = f.default;
            if (multiple) onChange({ ...val, [section.name]: [...entries, blank] });
            else onChange({ ...val, [section.name]: blank });
          };
          const removeEntry = (idx: number) => {
            if (multiple) { const next = entries.filter((_, i) => i !== idx); onChange({ ...val, [section.name]: next }); }
            else { const next = { ...val }; delete next[section.name]; onChange(next); }
          };
          return (
            <div key={section.name} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-600">{section.displayName || section.name}</span>
                {(multiple || entries.length === 0) && (
                  <button type="button" onClick={addEntry} className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800">
                    <Plus size={11} /> {fields.length ? section.displayName : 'Hinzufügen'}
                  </button>
                )}
              </div>
              {entries.map((entry, idx) => (
                <div key={idx} className="relative space-y-2 border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                  {fields.map(f => (
                    <FieldRow key={f.name} nodeType={nodeType} prop={f} value={entry?.[f.name]} siblings={entry || {}} credentialId={credentialId}
                      onChange={v => writeEntry(idx, { ...entry, [f.name]: v })} />
                  ))}
                  <button type="button" onClick={() => removeEntry(idx)} className="absolute -top-1 right-0 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // string / json / dateTime / sonstiges → Text bzw. Textarea
  const typeOpts = prop.typeOptions as Record<string, unknown> | undefined;
  const multiline = type === 'json' || typeOpts?.rows || typeOpts?.alwaysOpenEditWindow || typeOpts?.editor;
  const exprCls = isExpr ? 'font-mono text-violet-700' : '';
  if (multiline) {
    return <textarea rows={8} value={String(value ?? '')} placeholder={prop.placeholder} {...focusProps} onChange={e => onChange(e.target.value)} className={`${inputCls} font-mono resize-y ${exprCls}`} />;
  }
  return <input type="text" value={String(value ?? '')} placeholder={prop.placeholder} {...focusProps} onChange={e => onChange(e.target.value)} className={`${inputCls} ${exprCls}`} />;
}

/** Label + Feld + Hinweis. */
function FieldRow({ nodeType, prop, value, siblings, credentialId, onChange, onFocusName, onToggleExpr }: {
  nodeType: string; prop: N8nNodeProperty; value: unknown;
  siblings: Record<string, unknown>; credentialId?: string; onChange: (v: unknown) => void;
  onFocusName?: (name: string, cursorPos?: number) => void;
  onToggleExpr?: (name: string) => void;
}) {
  // Verschachtelte Sichtbarkeit (displayOptions) auch innerhalb von Collections beachten.
  if (!isPropertyVisible(prop, siblings)) return null;
  const labelled = prop.type !== 'boolean' && prop.type !== 'notice';
  // fx-Toggle nur für Text/Zahl-Felder (kein options/collection/boolean).
  const canExpr = ['string', 'number', 'json', 'dateTime'].includes(prop.type);
  const isExpr = typeof value === 'string' && value.startsWith('=');
  return (
    <div>
      {labelled && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">
            {prop.displayName}{prop.required ? ' *' : ''}
          </label>
          {canExpr && onToggleExpr && (
            <button type="button" onClick={() => onToggleExpr(prop.name)}
              title={isExpr ? 'Fester Wert' : 'Als Expression (Daten aus Vorschritt)'}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isExpr ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400 hover:text-gray-600'}`}>
              fx
            </button>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <ParamField nodeType={nodeType} prop={prop} value={value} siblings={siblings} credentialId={credentialId} onChange={onChange} onFocusName={onFocusName} />
      </div>{(prop.hint || prop.description) && prop.type !== 'notice' && (
        <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">{prop.hint || prop.description}</p>
      )}
    </div>
  );
}

export interface N8nParameterFormValue {
  n8nType: string;
  n8nTypeVersion: number;
  parameters: Record<string, unknown>;
  credentialType?: string;
  credentialValue?: string;
}

export default function N8nParameterForm({
  node,
  credential,
  projectId,
  existing,
  inputFields = [],
  onChange,
}: {
  node: N8nNodeTypeDescription;
  credential?: N8nCredentialTypeDescription | null;
  projectId?: string;
  existing?: Partial<N8nParameterFormValue>;
  inputFields?: IoField[];
  onChange?: (val: N8nParameterFormValue) => void;
}) {
  const [parameters, setParameters] = useState<Record<string, unknown>>(() =>
    mergeParameters(node.properties || [], existing?.parameters),
  );
  const [credentialValue, setCredentialValue] = useState(existing?.credentialValue ?? '');
  const [focusedName, setFocusedName] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<number | null>(null);

  const handleFocusName = (name: string, pos?: number) => {
    setFocusedName(name);
    if (pos !== undefined) setCursorPos(pos);
  };

  /** fx-Toggle: Feld in Expression-Modus (=…) oder zurück zu festem Wert. */
  const toggleExpr = (name: string) => setParameters(prev => {
    const cur = prev[name];
    const curStr = typeof cur === 'string' ? cur : cur != null ? String(cur) : '';
    return { ...prev, [name]: curStr.startsWith('=') ? curStr.slice(1) : `=${curStr}` };
  });

  /** Feld-Chip → Expression an das Cursor-Position des fokussierten Felds anhängen (sonst Clipboard). */
  const insertExpr = (field: IoField) => {
    if (!focusedName) { navigator.clipboard?.writeText(field.expression).catch(() => {}); return; }
    setParameters(prev => {
      const cur = prev[focusedName];
      const curStr = typeof cur === 'string' ? cur : cur != null ? String(cur) : '';
      const hadEquals = curStr.startsWith('=');
      const asExpr = hadEquals ? curStr : `=${curStr}`;
      
      const pos = (cursorPos ?? curStr.length) + (hadEquals ? 0 : 1);
      const before = asExpr.slice(0, pos);
      const after = asExpr.slice(pos);
      
      return { ...prev, [focusedName]: `${before}${field.expression}${after}` };
    });
  };

  const credentialType = node.credentials?.[0]?.name;
  const visible = useMemo(
    () => {
      // Nach Sichtbarkeit filtern UND nach name deduplizieren — manche Katalog-Nodes
      // (z. B. Code: jsCode/pythonCode) liefern doppelte Property-Definitionen,
      // was sonst „two children with the same key" + falsches Schreiben verursacht.
      const props = getVisibleProperties(node.properties || [], parameters);
      const seen = new Set<string>();
      return props.filter(p => (seen.has(p.name) ? false : (seen.add(p.name), true)));
    },
    [node.properties, parameters],
  );

  // Erster Lauf (Mount) NICHT speichern — sonst löst bloßes Öffnen eines Nodes
  // einen Save + n8n-Sync aus. Nur echte Nutzer-Änderungen melden.
  const skipInitialChange = useRef(true);
  useEffect(() => {
    if (skipInitialChange.current) { skipInitialChange.current = false; return; }
    onChange?.({
      n8nType: node.name,
      n8nTypeVersion: Array.isArray(node.version) ? node.version[node.version.length - 1] : (node.version ?? 1),
      parameters,
      credentialType,
      credentialValue: credentialValue || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameters, credentialValue, node.name, node.version, credentialType]);

  const setParam = (name: string, value: unknown) => setParameters(prev => ({ ...prev, [name]: value }));

  const iconUrl = iconUrlFromRef(node.iconUrl ?? (typeof node.icon === 'string' ? node.icon : node.icon?.light));

  return (
    <div className="space-y-4">
      {node.description && <p className="text-xs text-gray-500 leading-relaxed">{node.description}</p>}

      {credentialType && (
        <div className="mb-4 rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
            {credential?.displayName || credentialType} *
          </label>
          <N8nCredentialSelect
            projectId={projectId}
            toolName={node.name.split('.').pop() || ''}
            credentialType={credential || { name: credentialType, displayName: credentialType } as any}
            value={credentialValue}
            onChange={setCredentialValue}
          />
          {credential?.documentationUrl && (
            <a href={credential.documentationUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[11px] text-amber-600 hover:text-amber-800 underline underline-offset-2">
              Credential-Dokumentation ansehen
            </a>
          )}
        </div>
      )}

      {/* Datenfluss: Felder aus dem Vorschritt — Feld fokussieren, dann Chip klicken = Expression einfügen */}
      {inputFields.length > 0 && (
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-1.5">
            Daten aus Vorschritt {focusedName ? `→ „${focusedName}"` : '(Feld fokussieren)'}
          </p>
          <div className="flex flex-wrap gap-1">
            {inputFields.slice(0, 30).map(f => (
              <button key={f.path} type="button" onClick={() => insertExpr(f)}
                title={`${f.expression} · ${f.sample}`}
                className="rounded border border-violet-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-violet-700 hover:bg-violet-100">
                {f.path}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.map(prop => (
        <FieldRow key={prop.name} nodeType={node.name} prop={prop} value={parameters[prop.name]}
          siblings={parameters} credentialId={credentialValue} onChange={v => setParam(prop.name, v)}
          onFocusName={handleFocusName} onToggleExpr={toggleExpr} />
      ))}

      {/* Credential field moved to top */}

      {iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className="hidden" aria-hidden />
      )}
    </div>
  );
}
