"use client";

/**
 * Tool / node icon registry for the n8n-style workflow visualization.
 *
 * Maps an Axantilo tool name (or a generic workflow step type) to a real brand icon
 * (react-icons/si) or a clean generic node icon (lucide-react), plus the brand
 * accent colour and a short label — exactly like n8n renders its node tiles.
 */

import React from 'react';
import type { IconType } from 'react-icons';
import {
  SiGmail, SiGoogledocs, SiGooglesheets, SiGoogledrive, SiSlack, SiNotion,
  SiHubspot, SiAirtable, SiOpenai, SiGooglegemini, SiFacebook, SiMeta,
  SiInstagram, SiYoutube, SiTelegram, SiWhatsapp, SiGooglecalendar,
  SiWordpress, SiShopify, SiStripe, SiTiktok, SiTrello,
} from 'react-icons/si';
import {
  Clock, Globe, Webhook, Braces, GitBranch, Sparkles, Play, User,
  Mail, Database, Send, Cloud, Cpu, Settings2, type LucideIcon,
} from 'lucide-react';

export interface ToolVisual {
  Icon: IconType | LucideIcon;
  /** Brand accent colour (used for the icon + the node's left accent bar) */
  color: string;
  label: string;
}

// Brand / tool icons keyed by normalized tool name.
const TOOL_TABLE: Record<string, ToolVisual> = {
  gmail:         { Icon: SiGmail,         color: '#EA4335', label: 'Gmail' },
  email:         { Icon: Mail,            color: '#EA4335', label: 'Email' },
  google_docs:   { Icon: SiGoogledocs,    color: '#4285F4', label: 'Google Docs' },
  google_sheets: { Icon: SiGooglesheets,  color: '#34A853', label: 'Sheets' },
  google_drive:  { Icon: SiGoogledrive,   color: '#1FA463', label: 'Drive' },
  google_calendar:{ Icon: SiGooglecalendar, color: '#4285F4', label: 'Kalender' },
  onedrive:      { Icon: Cloud,           color: '#0364B8', label: 'OneDrive' },
  slack:         { Icon: SiSlack,         color: '#4A154B', label: 'Slack' },
  notion:        { Icon: SiNotion,        color: '#111827', label: 'Notion' },
  hubspot:       { Icon: SiHubspot,       color: '#FF7A59', label: 'HubSpot' },
  airtable:      { Icon: SiAirtable,      color: '#18BFFF', label: 'Airtable' },
  trello:        { Icon: SiTrello,        color: '#0052CC', label: 'Trello' },
  openai:        { Icon: SiOpenai,        color: '#111827', label: 'OpenAI' },
  gemini:        { Icon: SiGooglegemini,  color: '#8E75B2', label: 'Gemini' },
  mistral:       { Icon: Sparkles,        color: '#FF7000', label: 'Mistral' },
  facebook:      { Icon: SiFacebook,      color: '#1877F2', label: 'Facebook' },
  meta:          { Icon: SiMeta,          color: '#0866FF', label: 'Meta' },
  instagram:     { Icon: SiInstagram,     color: '#E4405F', label: 'Instagram' },
  youtube:       { Icon: SiYoutube,       color: '#FF0000', label: 'YouTube' },
  tiktok:        { Icon: SiTiktok,        color: '#111827', label: 'TikTok' },
  telegram:      { Icon: SiTelegram,      color: '#26A5E4', label: 'Telegram' },
  whatsapp:      { Icon: SiWhatsapp,      color: '#25D366', label: 'WhatsApp' },
  wordpress:     { Icon: SiWordpress,     color: '#21759B', label: 'WordPress' },
  shopify:       { Icon: SiShopify,       color: '#7AB55C', label: 'Shopify' },
  stripe:        { Icon: SiStripe,        color: '#635BFF', label: 'Stripe' },
  // Generic n8n-style nodes
  webhook:       { Icon: Webhook,         color: '#0EA5E9', label: 'Webhook' },
  schedule:      { Icon: Clock,           color: '#6B7280', label: 'Schedule' },
  http:          { Icon: Globe,           color: '#6366F1', label: 'HTTP' },
  set:           { Icon: Braces,          color: '#F97316', label: 'Set' },
  code:          { Icon: Braces,          color: '#F97316', label: 'Code' },
  decision:      { Icon: GitBranch,       color: '#EAB308', label: 'Verzweigung' },
  if:            { Icon: GitBranch,       color: '#EAB308', label: 'Verzweigung' },
  manual:        { Icon: Play,            color: '#9CA3AF', label: 'Manuell' },
  database:      { Icon: Database,        color: '#0EA5E9', label: 'Datenbank' },
};

// Fallback by generic workflow step type.
const TYPE_TABLE: Record<string, ToolVisual> = {
  trigger:  { Icon: Clock,    color: '#6B7280', label: 'Trigger' },
  action:   { Icon: Settings2,color: '#6366F1', label: 'Aktion' },
  ai:       { Icon: Sparkles, color: '#10B981', label: 'KI' },
  decision: { Icon: GitBranch,color: '#EAB308', label: 'Verzweigung' },
  human:    { Icon: User,     color: '#8B5CF6', label: 'Mensch' },
  output:   { Icon: Send,     color: '#0EA5E9', label: 'Ausgabe' },
};

/** Resolve the icon/colour/label for a tool name + (optional) step type. */
export function getToolVisual(tool?: string | null, type?: string | null): ToolVisual {
  const t = (tool || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (t && TOOL_TABLE[t]) return TOOL_TABLE[t];
  // Loose contains-match (e.g. "google sheets account" → sheets)
  if (t) {
    for (const key of Object.keys(TOOL_TABLE)) {
      if (t.includes(key) || key.includes(t)) return TOOL_TABLE[key];
    }
  }
  if (type && TYPE_TABLE[type]) return TYPE_TABLE[type];
  return { Icon: Cpu, color: '#64748b', label: tool || type || 'Node' };
}

/**
 * n8n-style node tile: white rounded square, brand icon centered, brand-coloured.
 * Renders a small left/right connection dot when `connectors` is set.
 */
export function ToolTile({
  tool,
  type,
  size = 56,
  selected = false,
}: {
  tool?: string | null;
  type?: string | null;
  size?: number;
  selected?: boolean;
}) {
  const { Icon, color } = getToolVisual(tool, type);
  return (
    <div
      className="rounded-2xl bg-white flex items-center justify-center transition-all"
      style={{
        width: size,
        height: size,
        border: `2px solid ${selected ? color : '#e5e7eb'}`,
        boxShadow: selected ? `0 0 0 3px ${color}22` : '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <Icon size={size * 0.46} color={color} />
    </div>
  );
}
