import type { CanvasData, CanvasDocument, CompanyProfile, PainPoint, Phase, UseCase, Workflow, WorkflowStep } from '@/lib/types';

/** Coerce LLM JSON values to safe display/save strings. */
export function toDisplayText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(v => toDisplayText(v)).filter(Boolean).join(' · ');
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text.trim();
    if (typeof o.description === 'string') return o.description.trim();
    if (typeof o.label === 'string') return o.label.trim();
    return Object.entries(o)
      .map(([k, v]) => {
        const inner = toDisplayText(v);
        return inner ? `${k}: ${inner}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

export function normalizeCompanyProfile(raw: unknown): CompanyProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;

  const offer = toDisplayText(c.offer ?? c.services ?? c.leistungen ?? c.angebot);
  const target_customers = toDisplayText(
    c.target_customers ?? c.zielkunden ?? c.target_customer
  );
  const acquisition = toDisplayText(c.acquisition ?? c.akquise ?? c.kundengewinnung);

  let process_steps: string[] = [];
  const ps = c.process_steps ?? c.process ?? c.ablauf;
  if (Array.isArray(ps)) {
    process_steps = ps.map(s => toDisplayText(s)).filter(Boolean);
  } else if (typeof ps === 'string') {
    process_steps = ps.split(/\n|;/).map(s => s.trim()).filter(Boolean);
  }

  const change_appetite = toDisplayText(c.change_appetite) || undefined;
  const notes = toDisplayText(c.notes) || undefined;

  if (!offer && !target_customers && !acquisition && process_steps.length === 0 && !notes) {
    return undefined;
  }

  return {
    offer: offer || undefined,
    target_customers: target_customers || undefined,
    acquisition: acquisition || undefined,
    process_steps: process_steps.length > 0 ? process_steps : undefined,
    change_appetite,
    notes,
  };
}

const COMPOUND_TOOL_ALIASES: [RegExp, string][] = [
  [/\bchat\s*gpt\b/gi, 'ChatGPT'],
  [/\bpower\s*point\b/gi, 'PowerPoint'],
  [/\bwhats\s*app\b/gi, 'WhatsApp'],
  [/\bcap\s*cut\b/gi, 'CapCut'],
  [/\bdall[·.]?e\b/gi, 'DALL·E'],
  [/\bgoogle\s+analytics\b/gi, 'Google Analytics'],
  [/\bmeta\s+business\s+suite\b/gi, 'Meta Business Suite'],
  [/\bfacebook\s+business\s+suite\b/gi, 'Meta Business Suite'],
  [/\bmicrosoft\s+word\b/gi, 'Microsoft Word'],
  [/\bmicrosoft\s+excel\b/gi, 'Microsoft Excel'],
  [/\bone\s*page(?:\.io)?\b/gi, 'Onepage.io'],
];

function normalizeCompoundTools(text: string): string {
  let out = text;
  for (const [re, name] of COMPOUND_TOOL_ALIASES) {
    out = out.replace(re, name);
  }
  return out;
}

/** Split LLM tool blobs into readable list items (no camelCase splits). */
export function parseToolList(raw: unknown): string[] {
  const text = normalizeCompoundTools(toDisplayText(raw));
  if (!text) return [];
  const parts = text
    .split(/\n+|•\s*|;\s*|·\s+|,\s+(?=[A-ZÄÖÜ(])/)
    .map(s => s.replace(/^\d+\.\s*/, '').replace(/^[-–]\s*/, '').trim())
    .map(s => normalizeCompoundTools(s))
    .filter(s => s.length > 1);
  return [...new Set(parts)];
}

/** Keep only tools the user actually mentioned in chat (anti-hallucination). */
export function filterToolsFromUserChat(
  tools: string[],
  history: { role: string; content: string }[]
): string[] {
  const userText = history
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n')
    .toLowerCase();

  if (!userText.trim()) return tools;

  return tools.filter(tool => {
    const normalized = tool.toLowerCase().trim();
    if (normalized.length < 2) return false;
    if (userText.includes(normalized)) return true;

    const tokens = normalized.split(/[\s/()+.-]+/).filter(t => t.length >= 4);
    if (tokens.length === 0) return false;
    const hits = tokens.filter(t => {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return re.test(userText);
    });
    return hits.length >= Math.min(2, tokens.length) || (tokens.length === 1 && hits.length === 1);
  });
}

function normalizeUseCase(
  raw: unknown,
  index: number,
  userHistory?: { role: string; content: string }[]
): UseCase | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const title = toDisplayText(u.title);
  if (!title) return null;
  let tools = parseToolList(u.tools ?? u.tool ?? u.ist_tools);
  if (userHistory?.length) {
    tools = filterToolsFromUserChat(tools, userHistory);
  }
  const tool = tools.length > 0 ? tools.join(' · ') : undefined;

  return {
    id: toDisplayText(u.id) || `uc_${index + 1}`,
    title,
    linked_pain_point: toDisplayText(u.linked_pain_point) || '',
    effort: toDisplayText(u.effort) || '',
    impact: toDisplayText(u.impact) || '',
    tool,
    tools: tools.length > 0 ? tools : undefined,
    setup_effort: toDisplayText(u.setup_effort) || undefined,
    cost_monthly: toDisplayText(u.cost_monthly) || undefined,
    roi: toDisplayText(u.roi) || undefined,
    priority: u.priority as UseCase['priority'],
  };
}

export function inferDocumentPhase(doc: Pick<CanvasDocument, 'title' | 'content' | 'phase'>): Phase {
  if (doc.phase && ['diagnose', 'analyse', 'plan', 'umsetzung'].includes(doc.phase)) {
    return doc.phase;
  }
  const blob = `${doc.title} ${doc.content}`.toLowerCase();
  if (/umsetzung|deploy|credential|go-live|phase\s*4/.test(blob)) return 'umsetzung';
  if (/workflow|automatisierung|blaupause|schritt-für-schritt|phase\s*3/.test(blob)) return 'plan';
  if (/tool|software|stack|marketing|projektmanagement|canva|airtable|ist-tool/.test(blob)) {
    return 'analyse';
  }
  return 'diagnose';
}

function normalizeDocument(raw: unknown, index: number): CanvasDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const title = toDisplayText(d.title);
  const content = toDisplayText(d.content);
  if (!title || !content || content.length < 20) return null;
  const phaseRaw = toDisplayText(d.phase).toLowerCase();
  const phase =
    phaseRaw === 'analyse' || phaseRaw === 'plan' || phaseRaw === 'umsetzung' || phaseRaw === 'diagnose'
      ? (phaseRaw as Phase)
      : undefined;
  const doc: CanvasDocument = {
    id: toDisplayText(d.id) || `doc_${index + 1}`,
    title,
    content,
    format: d.format === 'text' ? 'text' : 'markdown',
    phase,
  };
  return { ...doc, phase: doc.phase ?? inferDocumentPhase(doc) };
}

function normalizeWorkflowStep(raw: unknown, index: number): WorkflowStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const label = toDisplayText(s.label);
  if (!label) return null;
  const typeRaw = toDisplayText(s.type).toLowerCase();
  const type =
    typeRaw === 'trigger' || typeRaw === 'action' || typeRaw === 'ai' || typeRaw === 'decision' || typeRaw === 'output'
      ? typeRaw
      : 'action';
  return {
    id: toDisplayText(s.id) || `step_${index + 1}`,
    label,
    type,
    tool: toDisplayText(s.tool) || undefined,
  };
}

function shortenWorkflowTitle(title: string, maxWords = 5): string {
  const words = title.replace(/\s*\([a-z]+_\d+\)/gi, '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ');
}

/** Update in place by id or linked_pain_point — never duplicate per pain point */
function mergeWorkflows(existing: Workflow[], incoming: Workflow[]): Workflow[] {
  const result = existing.map(w => ({ ...w, steps: [...w.steps] }));
  for (const inc of incoming) {
    const idx = result.findIndex(
      w =>
        (inc.id && w.id === inc.id) ||
        (!!inc.linked_pain_point && w.linked_pain_point === inc.linked_pain_point)
    );
    if (idx >= 0) {
      result[idx] = {
        ...result[idx],
        title: inc.title || result[idx].title,
        steps: inc.steps.length > 0 ? inc.steps : result[idx].steps,
        linked_pain_point: inc.linked_pain_point || result[idx].linked_pain_point,
      };
    } else if (inc.linked_pain_point && result.some(w => w.linked_pain_point === inc.linked_pain_point)) {
      continue;
    } else {
      result.push(inc);
    }
  }
  return result;
}

function normalizeWorkflow(raw: unknown, index: number): Workflow | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  const title = shortenWorkflowTitle(toDisplayText(w.title));
  if (!title) return null;
  const stepsRaw = Array.isArray(w.steps) ? w.steps : [];
  const steps = stepsRaw
    .map((s, i) => normalizeWorkflowStep(s, i))
    .filter((s): s is WorkflowStep => s !== null);
  if (steps.length === 0) return null;
  return {
    id: toDisplayText(w.id) || `wf_${index + 1}`,
    title,
    linked_pain_point: toDisplayText(w.linked_pain_point) || '',
    steps,
  };
}

export function isValidWorkflow(w: Workflow): boolean {
  return !!(w.title?.trim() && w.steps?.length && w.steps.some(s => toDisplayText(s.label)));
}

function normalizePainPoint(raw: unknown, index: number): PainPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const title = toDisplayText(p.title);
  const description = toDisplayText(p.description);
  if (!title && !description) return null;

  const priorityRaw = toDisplayText(p.priority).toLowerCase();
  const priority: PainPoint['priority'] =
    priorityRaw === 'mittel' || priorityRaw === 'niedrig' ? priorityRaw : 'hoch';

  return {
    id: toDisplayText(p.id) || `pp_${index + 1}`,
    title: title || 'Pain Point',
    description: description || title,
    frequency: toDisplayText(p.frequency) || undefined,
    effort: toDisplayText(p.effort) || undefined,
    priority,
    rank: typeof p.rank === 'number' ? p.rank : undefined,
  };
}

/** Sanitize full canvas payload from Mistral before DB + React. */
export function normalizeCanvasData(
  raw: Record<string, unknown>,
  current: Partial<CanvasData> | null,
  phase: string,
  userHistory?: { role: string; content: string }[]
): CanvasData {
  const painRaw = Array.isArray(raw.pain_points) ? raw.pain_points : current?.pain_points;
  const pain_points = (Array.isArray(painRaw) ? painRaw : [])
    .map((p, i) => normalizePainPoint(p, i))
    .filter((p): p is PainPoint => p !== null);

  const company =
    normalizeCompanyProfile(raw.company) ??
    normalizeCompanyProfile(current?.company) ??
    undefined;

  const ucRaw = Array.isArray(raw.use_cases) ? raw.use_cases : current?.use_cases;
  const use_cases = (Array.isArray(ucRaw) ? ucRaw : [])
    .map((u, i) => normalizeUseCase(u, i, userHistory))
    .filter((u): u is UseCase => u !== null);

  const docRaw = Array.isArray(raw.documents) ? raw.documents : current?.documents;
  const documents = (Array.isArray(docRaw) ? docRaw : [])
    .map((d, i) => normalizeDocument(d, i))
    .filter((d): d is CanvasDocument => d !== null);

  const canExtractWorkflows = phase === 'plan' || phase === 'umsetzung';
  const wfFromRaw = canExtractWorkflows && Array.isArray(raw.workflows)
    ? raw.workflows
        .map((w, i) => normalizeWorkflow(w, i))
        .filter((w): w is Workflow => w !== null)
    : [];
  const wfKept = (current?.workflows ?? [])
    .map((w, i) => normalizeWorkflow(w, i))
    .filter((w): w is Workflow => w !== null);
  const workflows =
    wfFromRaw.length > 0 ? mergeWorkflows(wfKept, wfFromRaw) : wfKept;

  const impRaw = raw.implementer;
  let implementer = current?.implementer;
  if (phase === 'analyse' && impRaw && typeof impRaw === 'object') {
    const imp = impRaw as Record<string, unknown>;
    const who = toDisplayText(imp.who);
    const skill = toDisplayText(imp.skill_level);
    if (who || skill) {
      implementer = {
        id: toDisplayText(imp.id) || 'impl_1',
        is_chatter: Boolean(imp.is_chatter),
        who: who || 'Unbekannt',
        skill_level:
          skill === 'keine' || skill === 'grundkenntnisse' || skill === 'fortgeschritten' || skill === 'experte'
            ? skill
            : 'grundkenntnisse',
        automation_experience: toDisplayText(imp.automation_experience) || '',
      };
    }
  }

  return {
    pain_points: pain_points.length > 0 ? pain_points : (current?.pain_points ?? []),
    use_cases: use_cases.length > 0 ? use_cases : (current?.use_cases ?? []),
    workflows,
    documents: documents.length > 0 ? documents : (current?.documents ?? []).map((d, i) => normalizeDocument(d, i)).filter((d): d is CanvasDocument => d !== null),
    company,
    implementer,
    phase: (phase as CanvasData['phase']) || current?.phase || 'diagnose',
  };
}
