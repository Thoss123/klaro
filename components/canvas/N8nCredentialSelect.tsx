"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Key, Loader2, X, Check } from 'lucide-react';
import type { N8nCredentialTypeDescription } from '@/lib/n8n-catalog-types';
import { resolveOAuthProvider, OAUTH_PROVIDERS, normalizeCredentialTypeName, type OAuthProvider } from '@/lib/oauth-config';

type StoredCredential = {
  id: string;
  tool_name: string;
  credential_type: string;
  status: string;
  n8n_credential_id: string | null;
  created_at?: string;
};

function useOAuthConnect({
  oauthProvider,
  projectId,
  toolName,
  credentialTypeName,
  onSuccess,
}: {
  oauthProvider: OAuthProvider | null;
  projectId?: string;
  toolName: string;
  credentialTypeName: string;
  onSuccess: (credId: string) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!oauthProvider) return;
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; ok?: boolean; credentialId?: string; error?: string };
      if (data?.type !== 'axantilo_oauth') return;
      setConnecting(false);
      if (data.ok && data.credentialId) {
        setError('');
        onSuccess(data.credentialId);
      } else if (data.error) {
        setError(data.error);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [oauthProvider, onSuccess]);

  const connect = useCallback(() => {
    if (!oauthProvider) return;
    setError('');
    setConnecting(true);
    const returnUrl = window.location.pathname + window.location.search;
    const url = `/api/oauth/${oauthProvider}?` + new URLSearchParams({
      project_id: projectId ?? '',
      tool_name: toolName,
      n8n_credential_type: credentialTypeName,
      return_url: returnUrl,
    }).toString();
    const popup = window.open(url, 'axantilo_oauth', 'width=600,height=720');
    if (!popup) {
      window.location.href = url;
    }
  }, [oauthProvider, projectId, toolName, credentialTypeName]);

  return { connecting, error, connect, setError };
}

export default function N8nCredentialSelect({
  projectId,
  toolName,
  n8nType,
  credentialType,
  value,
  onChange,
}: {
  projectId?: string;
  toolName: string;
  n8nType?: string;
  credentialType: N8nCredentialTypeDescription;
  value?: string;
  onChange: (val: string) => void;
}) {
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const oauthProvider = resolveOAuthProvider(credentialType.name, n8nType);

  const refetchCredentials = useCallback(async () => {
    const url = projectId ? `/api/n8n/credentials?project_id=${projectId}` : '/api/n8n/credentials';
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.credentials || []) as StoredCredential[];
  }, [projectId]);

  useEffect(() => {
    async function fetchCredentials() {
      setLoading(true);
      try {
        const creds = await refetchCredentials();
        setCredentials(creds);

        if (!value) {
          const toolCreds = creds.filter((c: StoredCredential) => c.tool_name === toolName);
          if (toolCreds.length === 1 && toolCreds[0].n8n_credential_id) {
            onChange(toolCreds[0].n8n_credential_id);
          }
        }
      } catch (e) {
        console.error('Failed to fetch credentials:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchCredentials();
  }, [projectId, toolName, value, onChange, refetchCredentials]);

  const toolCredentials = credentials.filter(c => c.tool_name === toolName);
  const selectedCred = toolCredentials.find(c => c.n8n_credential_id === value);
  const isConnected = Boolean(selectedCred?.n8n_credential_id || value);

  const handleOAuthSuccess = useCallback(async (credId: string) => {
    const creds = await refetchCredentials();
    setCredentials(creds);
    onChange(credId);
  }, [onChange, refetchCredentials]);

  const oauth = useOAuthConnect({
    oauthProvider,
    projectId,
    toolName,
    credentialTypeName: normalizeCredentialTypeName(credentialType.name) || credentialType.name,
    onSuccess: handleOAuthSuccess,
  });

  const handleDelete = async () => {
    if (!selectedCred) return;
    if (!confirm('Sicher, dass du diese Verbindung trennen willst?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/n8n/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedCred.id }),
      });
      if (res.ok) {
        setCredentials(prev => prev.filter(c => c.id !== selectedCred.id));
        onChange('');
      } else {
        alert('Fehler beim Trennen der Verbindung.');
      }
    } catch (e) {
      console.error(e);
      alert('Fehler beim Trennen.');
    } finally {
      setLoading(false);
    }
  };

  // OAuth-Tools (Google, Microsoft, …): direkter Verbinden-Button — kein Dropdown/Popup.
  if (oauthProvider) {
    const label = OAUTH_PROVIDERS[oauthProvider].label;
    return (
      <div className="space-y-3">
        {isConnected ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <Check size={16} className="text-emerald-600 shrink-0" />
            <span className="text-sm font-medium text-emerald-800 flex-1">{label} verbunden</span>
            <button
              type="button"
              onClick={oauth.connect}
              disabled={loading || oauth.connecting}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              Erneut verbinden
            </button>
            {selectedCred && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Trennen
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 leading-relaxed">
              Verbinde dein <span className="font-semibold">{label}</span>-Konto in drei Klicks —
              Konto wählen, bestätigen, fertig. Kein API-Key nötig.
            </p>
            <button
              type="button"
              onClick={oauth.connect}
              disabled={loading || oauth.connecting}
              className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {oauth.connecting
                ? <><Loader2 size={16} className="animate-spin" /> Warte auf Bestätigung…</>
                : <>Mit {label} verbinden</>}
            </button>
            <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
              <Key size={12} className="shrink-0 mt-0.5" />
              Es öffnet sich ein Login-Fenster von {label}. Die Zugangsdaten werden sicher gespeichert —
              Axantilo sieht dein Passwort nie.
            </p>
          </>
        )}
        {oauth.error && (
          <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{oauth.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <select
            value={(selectedCred ? selectedCred.n8n_credential_id : value) || ''}
            onChange={(e) => {
              if (e.target.value === 'new') {
                setModalOpen(true);
              } else {
                onChange(e.target.value);
              }
            }}
            disabled={loading}
            className="w-full text-[13px] border border-gray-300 rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:opacity-50"
          >
            <option value="" disabled>Zugangsdaten auswählen…</option>
            {toolCredentials.map(c => (
              <option key={c.id} value={c.n8n_credential_id ?? ''}>
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
          refetchCredentials()
            .then(creds => {
              setCredentials(creds);
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

  if (!open || typeof document === 'undefined') return null;

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
