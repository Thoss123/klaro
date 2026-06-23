"use client";

/**
 * Phase 4: Step configuration modal.
 *
 * Opened when a user clicks a step pill in the WorkflowDeployCard. Renders one of
 * five panels depending on the step's config type (credential / ai / human /
 * schedule / webhook). Does NOT call any API — it returns the chosen config to
 * the parent via onSave(). Credentials are only sent to /api/n8n/credentials at
 * deploy time (batched), mirroring the existing CredentialPopup behaviour.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Check, Copy } from 'lucide-react';
import { WorkflowStep, StepConfig, StepConfigType } from '@/lib/types';

const TOOL_ICONS: Record<string, string> = {
  gmail: '📧', google_docs: '📄', google_sheets: '📊', slack: '💬',
  notion: '📝', hubspot: '🧲', airtable: '🗃️', openai: '🤖',
  gemini: '✨', mistral: '🌬️', webhook: '🔗', http: '🌐', schedule: '⏰',
};

const CONFIG_TITLES: Record<StepConfigType, string> = {
  credential: 'Zugang verbinden',
  ai: 'KI-Schritt anpassen',
  human: 'Benachrichtigung einrichten',
  schedule: 'Zeitplan festlegen',
  webhook: 'Webhook-Trigger',
  n8n: 'Node konfigurieren',
};

// Model options per AI tool
const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (stark)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini (günstig)' },
  ],
  gemini: [
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (schnell)' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (stark)' },
  ],
  mistral: [
    { value: 'mistral-large-latest', label: 'Mistral Large (stark)' },
    { value: 'mistral-small-latest', label: 'Mistral Small (günstig)' },
  ],
};

// Friendly preview for common cron patterns
const CRON_PRESETS: { value: string; label: string }[] = [
  { value: '0 8 * * 1-5', label: 'Werktags um 8:00 Uhr' },
  { value: '0 9 * * *', label: 'Täglich um 9:00 Uhr' },
  { value: '0 9 * * 1', label: 'Jeden Montag um 9:00 Uhr' },
  { value: '0 * * * *', label: 'Jede Stunde' },
  { value: '*/15 * * * *', label: 'Alle 15 Minuten' },
];

function cronPreview(expr: string): string {
  const hit = CRON_PRESETS.find(p => p.value === expr.trim());
  return hit ? hit.label : (expr.trim() ? `Cron: ${expr.trim()}` : '');
}

const CHANNELS: { value: 'email' | 'whatsapp' | 'telegram'; label: string; placeholder: string }[] = [
  { value: 'email', label: '📧 Email', placeholder: 'name@firma.de' },
  { value: 'whatsapp', label: '💬 WhatsApp', placeholder: '+49 151 23456789' },
  { value: 'telegram', label: '✈️ Telegram', placeholder: '@username oder Chat-ID' },
];

export default function StepConfigModal({
  step,
  configType,
  existing,
  onSave,
  onClose,
}: {
  step: WorkflowStep;
  configType: StepConfigType;
  existing?: StepConfig;
  onSave: (config: StepConfig) => void;
  onClose: () => void;
}) {
  const tool = step.tool?.toLowerCase() ?? '';

  // credential
  const [credentialValue, setCredentialValue] = useState(existing?.credentialValue ?? '');
  // ai
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? '');
  const modelOptions = AI_MODELS[tool] ?? AI_MODELS.openai;
  const [model, setModel] = useState(existing?.model ?? modelOptions[0].value);
  // human
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'telegram'>(existing?.channel ?? 'email');
  const [address, setAddress] = useState(existing?.address ?? '');
  // schedule
  const [cronExpression, setCronExpression] = useState(existing?.cronExpression ?? CRON_PRESETS[0].value);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const webhookUrl = `https://n8n.deinefirma.de/webhook/axantilo-${step.id}`;

  const handleSave = () => {
    setError('');
    if (configType === 'credential' && !credentialValue.trim()) {
      setError('Bitte gib den API-Key ein.');
      return;
    }
    if (configType === 'human' && !address.trim()) {
      setError('Bitte gib eine Adresse / Nummer ein.');
      return;
    }
    if (configType === 'schedule' && !cronExpression.trim()) {
      setError('Bitte gib einen Zeitplan ein.');
      return;
    }
    setSaving(true);
    const config: StepConfig = { configType };
    if (configType === 'credential') config.credentialValue = credentialValue.trim();
    if (configType === 'ai') { config.systemPrompt = systemPrompt.trim(); config.model = model; }
    if (configType === 'human') { config.channel = channel; config.address = address.trim(); }
    if (configType === 'schedule') config.cronExpression = cronExpression.trim();
    onSave(config);
  };

  const activeChannel = CHANNELS.find(c => c.value === channel)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">
              {TOOL_ICONS[tool] || (configType === 'human' ? '🔔' : configType === 'ai' ? '🤖' : '🔑')}
            </div>
            <div>
              <div className="font-semibold text-gray-800 text-sm">{CONFIG_TITLES[configType]}</div>
              <div className="text-[11px] text-gray-400">{step.label}</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-2">
          {configType === 'credential' && (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                API Key / Access Token
              </label>
              <input
                autoFocus
                type="password"
                placeholder={`${tool || 'service'} API Key…`}
                value={credentialValue}
                onChange={e => setCredentialValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              />
              <p className="mt-2 text-[11px] text-gray-400">
                Der Key wird verschlüsselt gespeichert und erst beim Deploy an n8n übergeben.
              </p>
            </>
          )}

          {configType === 'ai' && (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                System-Prompt (optional)
              </label>
              <textarea
                autoFocus
                rows={4}
                placeholder="z.B. Du bist ein Assistent, der eingehende Mails kurz zusammenfasst und die Priorität einschätzt."
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 resize-none"
              />
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 mt-3 uppercase tracking-wider">
                Modell
              </label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              >
                {modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </>
          )}

          {configType === 'human' && (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Kanal
              </label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {CHANNELS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setChannel(c.value)}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                      channel === c.value
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                {channel === 'email' ? 'Email-Adresse' : channel === 'whatsapp' ? 'WhatsApp-Nummer' : 'Telegram'}
              </label>
              <input
                autoFocus
                type="text"
                placeholder={activeChannel.placeholder}
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              />
            </>
          )}

          {configType === 'schedule' && (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Vorlage
              </label>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {CRON_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setCronExpression(p.value)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                      cronExpression.trim() === p.value
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Cron-Ausdruck
              </label>
              <input
                type="text"
                placeholder="0 8 * * 1-5"
                value={cronExpression}
                onChange={e => setCronExpression(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              />
              {cronPreview(cronExpression) && (
                <p className="mt-2 text-[11px] text-indigo-500 font-medium">→ {cronPreview(cronExpression)}</p>
              )}
            </>
          )}

          {configType === 'webhook' && (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Webhook-URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-600"
                />
                <button
                  onClick={() => { navigator.clipboard?.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                  title="Kopieren"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Dieser Schritt wird ausgelöst, wenn ein Dienst Daten an diese URL sendet. Die finale URL siehst du nach dem Deploy.
              </p>
            </>
          )}

          {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 pb-5 pt-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-500 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Speichern
          </button>
        </div>
      </motion.div>
    </div>
  );
}
