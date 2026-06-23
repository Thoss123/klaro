"use client";

/**
 * n8n-native right-side parameter panel — loads node schema from catalog.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Replace, Trash2 } from 'lucide-react';
import { WorkflowStep, StepConfig } from '@/lib/types';
import type { N8nCredentialTypeDescription, N8nNodeTypeDescription } from '@/lib/n8n-catalog-types';
import N8nParameterForm, { type N8nParameterFormValue } from './N8nParameterForm';
import N8nNodePickerModal from './N8nNodePickerModal';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import type { IoField, NodeRunLite } from '@/lib/workflow-io';
import N8nNodeIcon from './N8nNodeIcon';
import { isOAuthCredentialType } from '@/lib/oauth-config';

export default function StepConfigPanel({
  step,
  projectId,
  isFirstStep = false,
  existing,
  inputFields = [],
  inputRun,
  onSave,
  onClose,
  onNodeTypeChange,
  onDelete,
}: {
  step: WorkflowStep;
  projectId?: string;
  isFirstStep?: boolean;
  existing?: StepConfig;
  inputFields?: IoField[];
  inputRun?: NodeRunLite;
  onSave: (config: StepConfig) => void;
  onClose: () => void;
  onNodeTypeChange?: (stepId: string, n8nType: string, version: number) => void;
  onDelete?: (stepId: string) => void;
}) {
  const [node, setNode] = useState<N8nNodeTypeDescription | null>(null);
  const [credential, setCredential] = useState<N8nCredentialTypeDescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formValue, setFormValue] = useState<N8nParameterFormValue | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const loadedTypeRef = useRef<string | null>(null);

  const n8nType = step.n8nType || existing?.n8nType;

  // Preferred credential type: aus Step-Config oder node-map — überstimmt credentials[0]
  // des Katalogs (z. B. gmailOAuth2 statt googleApi/Service-Account).
  const preferredCredType = existing?.credentialType || step.credentialType;

  const loadNode = useCallback(async (typeName: string, preferredCred?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/n8n/catalog?node=${encodeURIComponent(typeName)}`);
      if (!res.ok) throw new Error('Node nicht im Katalog gefunden');
      const data = await res.json();
      setNode(data.node);
      loadedTypeRef.current = typeName;
      const nodeCredNames: string[] = (data.node?.credentials ?? []).map((c: { name: string }) => c.name);
      // Priority: 1) step's explicit credentialType, 2) any OAuth type in the list,
      // 3) first in catalog (e.g. googleApi Service Account).
      // This ensures Gmail → gmailOAuth2, Outlook → microsoftOutlookOAuth2Api,
      // even when the catalog puts a service-account type first.
      const credType =
        (preferredCred && nodeCredNames.includes(preferredCred) ? preferredCred : null)
        ?? nodeCredNames.find(isOAuthCredentialType)
        ?? nodeCredNames[0];
      if (credType) {
        const credRes = await fetch(`/api/n8n/catalog?credential=${encodeURIComponent(credType)}`);
        if (credRes.ok) {
          const credData = await credRes.json();
          setCredential(credData.credential);
        }
      } else {
        setCredential(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
      setNode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadedTypeRef.current = null;
    // Reset derived state before loading so stale values aren't visible.
    // Using startTransition-style batching via a single async kick.
    async function resetAndLoad() {
      setFormValue(null);
      setError('');
      if (!n8nType) {
        setLoading(false);
        setNode(null);
        return;
      }
      await loadNode(n8nType, preferredCredType);
    }
    resetAndLoad();
  }, [step.id, n8nType, preferredCredType, loadNode]);

  const handlePickerSelect = (entry: N8nCatalogIndexEntry) => {
    onNodeTypeChange?.(step.id, entry.name, entry.version);
    loadedTypeRef.current = null;
    loadNode(entry.name);
  };

  // onSave kann eine inline-Arrow vom Parent sein (neue Identität pro Render).
  // Über ein Ref aufrufen, damit NICHT die onSave-Identität den Effekt triggert
  // (sonst: onSave → Parent-setState → Re-Render → neue onSave → Effekt → Endlosschleife + Sync-Storm).
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    if (!formValue || !node) return;
    onSaveRef.current({
      configType: 'n8n',
      n8nType: formValue.n8nType,
      n8nTypeVersion: formValue.n8nTypeVersion,
      parameters: formValue.parameters,
      credentialType: formValue.credentialType,
      credentialValue: formValue.credentialValue,
    });
  }, [formValue, node]);

  return (
    <>
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute top-[3%] left-[3%] right-[3%] bottom-[3%] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col z-20 overflow-hidden"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-lg bg-[#f7f7fa] border border-gray-200 flex items-center justify-center shrink-0">
              <N8nNodeIcon
                tool={step.tool || node?.name.split('.').pop()}
                type={step.type}
                n8nType={node?.name || n8nType}
                label={step.label}
                size={28}
                color="#6366f1"
              />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 text-sm truncate">{step.label}</div>
              <div className="text-[11px] text-gray-400 truncate">
                {node?.displayName || (n8nType ? n8nType.split('.').pop() : 'Node wählen…')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPickerOpen(true)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500" title="Node wechseln">
              <Replace size={16} />
            </button>
            {onDelete && !isFirstStep && (
              <button onClick={() => { onDelete(step.id); onClose(); }} className="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center text-red-500" title="Schritt löschen">
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400" title="Schließen">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* n8n-NDV: INPUT | Parameters | OUTPUT */}
        <div className="flex-1 min-h-0 flex divide-x divide-gray-100">
          {/* ── INPUT (links): Felder, die vom Vorschritt reinkommen ── */}
          <div className="w-[24%] min-w-[190px] overflow-y-auto px-3.5 py-3 bg-gray-50/40">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Input — vom Vorschritt</p>
            {step.note && (
              <div className="mb-3 rounded-lg bg-indigo-50/70 border border-indigo-100 px-2.5 py-2">
                <p className="text-[12px] leading-snug text-gray-700">{step.note}</p>
              </div>
            )}
            {inputFields.length > 0 ? (
              <ul className="space-y-1">
                {inputFields.map(f => (
                  <li key={f.path} className="flex items-center justify-between gap-2 rounded-md bg-white border border-gray-200 px-2 py-1">
                    <span className="font-mono text-[11px] text-gray-700 truncate">{f.path}</span>
                    <span className="text-[10px] text-gray-400 truncate max-w-[45%]">{f.sample}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Noch keine Eingangsdaten. Führe einen <span className="font-medium">Testlauf</span> aus — dann erscheinen hier die Felder vom vorherigen Schritt.
              </p>
            )}
            {inputFields.length > 0 && (
              <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
                Diese Felder nutzt du im mittleren Bereich: Feld auf <span className="font-bold">fx</span> stellen, dann anklicken.
              </p>
            )}
          </div>

          {/* ── PARAMETERS (mitte) ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {loading && (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}

            {!loading && !node && !n8nType && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-4">Noch kein n8n-Node zugeordnet.</p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100"
                >
                  Node auswählen
                </button>
              </div>
            )}

            {!loading && node && (
              <N8nParameterForm
                node={node}
                projectId={projectId}
                credential={credential}
                inputFields={inputFields}
                existing={{
                  n8nType: existing?.n8nType || node.name,
                  n8nTypeVersion: existing?.n8nTypeVersion,
                  parameters: { ...step.parameters, ...existing?.parameters },
                  credentialType: existing?.credentialType,
                  credentialValue: existing?.credentialValue,
                }}
                onChange={setFormValue}
              />
            )}

            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          </div>

          {/* ── OUTPUT (rechts): Ergebnis/Error des letzten Laufs ── */}
          <div className="w-[28%] min-w-[220px] overflow-y-auto px-3.5 py-3 bg-gray-50/40">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center justify-between">
              <span>Output — letzter Lauf</span>
              {inputRun && (
                <span className={inputRun.status === 'error' ? 'text-red-500' : 'text-gray-400'}>
                  {inputRun.status === 'error' ? 'Fehler' : `${inputRun.itemCount ?? inputRun.json?.length ?? 0} Items`}
                </span>
              )}
            </p>
            {inputRun ? (
              inputRun.status === 'error' ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-[11px] text-red-700 leading-relaxed whitespace-pre-wrap break-words">
                  {inputRun.error ?? 'Dieser Schritt ist im Testlauf gescheitert.'}
                </div>
              ) : (
                <pre className="text-[11px] leading-snug bg-gray-900 text-gray-100 rounded-lg p-3 overflow-auto">
                  {JSON.stringify(inputRun.json?.slice(0, 8) ?? [], null, 2)}
                </pre>
              )
            ) : (
              <p className="text-[11px] text-gray-400 leading-relaxed">Noch kein Output — führe <span className="font-medium">Testen</span> aus.</p>
            )}
          </div>
        </div>

          {/* Footer removed */}
      </motion.div>

      <N8nNodePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        title="Node wechseln"
        subtitle={step.label}
        currentType={node?.name || n8nType}
        filterMode={isFirstStep ? 'trigger-only' : 'no-trigger'}
        defaultCategory={isFirstStep ? 'trigger' : undefined}
      />
    </>
  );
}
