/**
 * Extract machine-readable control tags from coach message content (dev export).
 */

import {
  parseCoachCanvasUpdate,
  parsePhaseComplete,
  parseWorkflowPlans,
  hasCanvasTrigger,
} from '@/lib/simulation/tags';
import { stripInternalTags } from '@/lib/strip-internal-tags';

function extractPairedJsonTags(content: string, tag: string): unknown[] {
  const out: unknown[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  for (const m of content.matchAll(re)) {
    const raw = m[1].trim();
    if (!raw) {
      out.push(null);
      continue;
    }
    try {
      out.push(JSON.parse(raw));
    } catch {
      out.push({ _raw: raw, _parse_error: true });
    }
  }
  return out;
}

function extractPhaseCompleteTags(content: string): string[] {
  const out: string[] = [];
  const re = /<phase_complete>\s*([a-zA-Z]+)\s*<\/phase_complete>/gi;
  for (const m of content.matchAll(re)) {
    if (m[1]) out.push(m[1].toLowerCase());
  }
  return out;
}

export type ParsedMessageTags = {
  canvas_updates: ReturnType<typeof parseCoachCanvasUpdate>[];
  workflow_plans: Array<Record<string, unknown>>;
  tool_calls: unknown[];
  canvas_built: unknown[];
  options: unknown[];
  user_attachments: unknown[];
  request_credentials: unknown[];
  deploy_workflows: unknown[];
  test_workflows: unknown[];
  activate_workflows: unknown[];
  show_workflows: unknown[];
  prepare_phases: unknown[];
  phase_complete: string[];
  trigger_canvas_update: boolean;
  stream_reset: boolean;
};

export function parseMessageTags(content: string): ParsedMessageTags {
  const canvasUpdates: ReturnType<typeof parseCoachCanvasUpdate>[] = [];
  for (const m of (content || '').matchAll(/<canvas_update>([\s\S]*?)<\/canvas_update>/gi)) {
    try {
      canvasUpdates.push(JSON.parse(m[1].trim()));
    } catch {
      canvasUpdates.push(null);
    }
  }

  return {
    canvas_updates: canvasUpdates,
    workflow_plans: parseWorkflowPlans(content),
    tool_calls: extractPairedJsonTags(content, 'tool_call'),
    canvas_built: extractPairedJsonTags(content, 'canvas_built'),
    options: extractPairedJsonTags(content, 'options'),
    user_attachments: extractPairedJsonTags(content, 'user_attachments'),
    request_credentials: extractPairedJsonTags(content, 'request_credential'),
    deploy_workflows: extractPairedJsonTags(content, 'deploy_workflow'),
    test_workflows: extractPairedJsonTags(content, 'test_workflow'),
    activate_workflows: extractPairedJsonTags(content, 'activate_workflow'),
    show_workflows: extractPairedJsonTags(content, 'show_workflows'),
    prepare_phases: extractPairedJsonTags(content, 'prepare_phase'),
    phase_complete: extractPhaseCompleteTags(content),
    trigger_canvas_update: hasCanvasTrigger(content),
    stream_reset: /stream_reset/i.test(content || ''),
  };
}

export type ExportedMessage = {
  id: string;
  role: 'user' | 'assistant';
  created_at: string | null;
  content_raw: string;
  content_visible: string;
  parsed: ParsedMessageTags;
  phase_complete_detected: string | null;
};

export function toExportedMessage(msg: {
  id: string;
  role: string;
  content: string;
  created_at?: string | null;
}): ExportedMessage {
  const content = msg.content || '';
  const parsed = parseMessageTags(content);
  return {
    id: msg.id,
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    created_at: msg.created_at ?? null,
    content_raw: content,
    content_visible: stripInternalTags(content),
    parsed,
    phase_complete_detected: parsePhaseComplete(content) ?? null,
  };
}
