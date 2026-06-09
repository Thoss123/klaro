"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Plus, Loader2, X, Check } from 'lucide-react';
import type { N8nCredentialTypeDescription } from '@/lib/n8n-catalog-types';

export default function N8nCredentialSelect({
  projectId,
  toolName,
  credentialType,
  value,
  onChange,
}: {
  projectId?: string;
  toolName: string;
  credentialType: N8nCredentialTypeDescription;
  value?: string;
  onChange: (val: string) => void;
}) {
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    async function fetchCredentials() {
      setLoading(true);
      try {
        const url = projectId ? `/api/n8n/credentials?project_id=${projectId}` : '/api/n8n/credentials';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const creds = data.credentials || [];
          setCredentials(creds);
          
          // Auto-Select if exactly one credential exists for this tool
          if (!value) {
            const toolCreds = creds.filter((c: any) => c.tool_name === toolName);
            if (toolCreds.length === 1 && toolCreds[0].n8n_credential_id) {
              onChange(toolCreds[0].n8n_credential_id);
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch credentials:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchCredentials();
  }, [projectId, toolName, value, onChange]);

  // Filter credentials specific to this tool
  const toolCredentials = credentials.filter(c => c.tool_name === toolName);

  const selectedCred = toolCredentials.find(c => c.n8n_credential_id === value);

  const handleDelete = async () => {
    if (!selectedCred) return;
    if (!confirm('Sicher, dass du dieses Credential löschen willst?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/n8n/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedCred.id })
      });
      if (res.ok) {
        setCredentials(prev => prev.filter(c => c.id !== selectedCred.id));
        onChange('');
      } else {
        alert('Fehler beim Löschen des Credentials.');
      }
    } catch (e) {
      console.error(e);
      alert('Fehler beim Löschen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <select
            value={selectedCred ? selectedCred.n8n_credential_id : value || ''}
            onChange={(e) => {
              if (e.target.value === 'new') {
                setModalOpen(true);
                // Don't change actual value yet
              } else {
                onChange(e.target.value);
              }
            }}
            disabled={loading}
            className="w-full text-[13px] border border-gray-300 rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:opacity-50"
          >
            <option value="" disabled>Zugangsdaten auswählen…</option>
            {toolCredentials.map(c => (
              <option key={c.id} value={c.n8n_credential_id}>
                {credentialType.displayName} (Gespeichert)
              </option>
            ))}
            <option value="new">+ Neues Credential anlegen</option>
          </select>
          <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        
        {selectedCred && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setModalOpen(true)}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
              title="Dieses Credential überschreiben"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              title="Dieses Credential löschen"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        )}
      </div>

      <N8nCredentialModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        projectId={projectId}
        toolName={toolName}
        credentialType={credentialType}
        mode={selectedCred ? 'edit' : 'create'}
        onSuccess={(credId) => {
          setModalOpen(false);
          // Refetch to get the new credential in the list
          fetch(projectId ? `/api/n8n/credentials?project_id=${projectId}` : '/api/n8n/credentials')
            .then(res => res.json())
            .then(data => {
              setCredentials(data.credentials || []);
              onChange(credId);
            });
        }}
      />
    </div>
  );
}

function N8nCredentialModal({
  open,
  onClose,
  projectId,
  toolName,
  credentialType,
  mode = 'create',
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  toolName: string;
  credentialType: N8nCredentialTypeDescription;
  mode?: 'create' | 'edit';
  onSuccess: (credId: string) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('Bitte API Key eingeben');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/n8n/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          tool_name: toolName,
          credential_type: 'api_key',
          n8n_credential_type: credentialType.name,
          value: apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Speichern');
      if (data.credential?.n8n_credential_id || data.credential?.id) {
        onSuccess(data.credential.n8n_credential_id || data.credential.id);
      } else {
        throw new Error('Credential konnte nicht gespeichert werden.');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900">{mode === 'edit' ? 'Credential überschreiben' : 'Neues Credential anlegen'}</h3>
            <p className="text-xs text-gray-500">{credentialType.displayName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key / Token
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="sk-..."
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <p className="mt-2 text-[11px] text-gray-500 flex items-start gap-1.5">
            <Key size={12} className="shrink-0 mt-0.5" />
            Dein Key wird mit AES-256 verschlüsselt in unserer Datenbank und sicher im n8n-Tresor gespeichert.
          </p>

          {error && <p className="mt-4 text-xs text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}
          
          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Speichern
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
