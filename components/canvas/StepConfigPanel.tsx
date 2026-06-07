"use client";

/**
 * n8n-native right-side parameter panel — loads node schema from catalog.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Loader2, Replace, Trash2 } from 'lucide-react';
import { WorkflowStep, StepConfig } from '@/lib/types';
import type { N8nCredentialTypeDescription, N8nNodeTypeDescription } from '@/lib/n8n-catalog-types';
import N8nParameterForm, { type N8nParameterFormValue } from './N8nParameterForm';
import N8nNodePickerModal from './N8nNodePickerModal';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import { mergeParameters } from '@/lib/n8n-parameter-utils';
import N8nNodeIcon from './N8nNodeIcon';

function resolveNodeVersion(node: N8nNodeTypeDescription): number {
  const v = node.version;
  return Array.isArray(v) ? v[v.length - 1] : (v ?? 1);
}

export default function StepConfigPanel({
  step,
  isFirstStep = false,
  existing,
  onSave,
  onClose,
  onNodeTypeChange,
  onDelete,
}: {
  step: WorkflowStep;
  isFirstStep?: boolean;
  existing?: StepConfig;
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
  const [saving, setSaving] = useState(false);
  const loadedTypeRef = useRef<string | null>(null);

  const n8nType = step.n8nType || existing?.n8nType;

  const loadNode = useCallback(async (typeName: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/n8n/catalog?node=${encodeURIComponent(typeName)}`);
      if (!res.ok) throw new Error('Node nicht im Katalog gefunden');
      const data = await res.json();
      setNode(data.node);
      loadedTypeRef.current = typeName;
      const credType = data.node?.credentials?.[0]?.name;
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
    setFormValue(null);
    setError('');
    loadedTypeRef.current = null;
    if (!n8nType) {
      setLoading(false);
      setNode(null);
      return;
    }
    loadNode(n8nType);
  }, [step.id, n8nType, loadNode]);

  const handlePickerSelect = (entry: N8nCatalogIndexEntry) => {
    onNodeTypeChange?.(step.id, entry.name, entry.version);
    loadedTypeRef.current = null;
    loadNode(entry.name);
  };

  const handleSave = () => {
    if (!node) {
      setError('Kein Node ausgewählt.');
      return;
    }
    const val: N8nParameterFormValue = formValue ?? {
      n8nType: node.name,
      n8nTypeVersion: resolveNodeVersion(node),
      parameters: mergeParameters(node.properties || [], existing?.parameters),
      credentialType: node.credentials?.[0]?.name,
      credentialValue: existing?.credentialValue,
    };
    if (node.credentials?.length && !val.credentialValue?.trim()) {
      setError('Bitte Credential / API Key eingeben.');
      return;
    }
    setSaving(true);
    onSave({
      configType: 'n8n',
      n8nType: val.n8nType,
      n8nTypeVersion: val.n8nTypeVersion,
      parameters: val.parameters,
      credentialType: val.credentialType,
      credentialValue: val.credentialValue,
    });
  };

  return (
    <>
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute top-[5%] right-[2%] bottom-[5%] w-[min(400px,36vw)] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col z-20 overflow-hidden"
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
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {step.note && (
            <div className="mb-4 rounded-xl bg-indigo-50/70 border border-indigo-100 px-3.5 py-3">
              <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">Was dieser Schritt macht</p>
              <p className="text-[13px] leading-snug text-gray-700">{step.note}</p>
            </div>
          )}

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
              credential={credential}
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

        <div className="shrink-0 border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50/50">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-white text-gray-700 bg-white font-medium"
          >
            <Replace size={16} />
            Node wechseln…
          </button>

          {onDelete && !isFirstStep && (
            <button
              type="button"
              onClick={() => onDelete(step.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm border border-red-200 rounded-xl hover:bg-red-50 text-red-600 bg-white font-medium"
            >
              <Trash2 size={16} />
              Schritt löschen
            </button>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-white bg-white">
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !node}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Speichern
            </button>
          </div>
        </div>
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
