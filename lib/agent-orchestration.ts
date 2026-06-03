/**
 * Sprint 3 — Canvas orchestration pipeline.
 *
 *   Coach: <trigger_canvas_update>
 *     → POST /api/canvas-worker
 *       → runCanvasPipeline()            [this file]
 *           1. Supervisor   (topic, one pain point, merge vs. new)
 *           2. Topic Research (only phase=plan + topic needs it)
 *           3. Workflow QA   (order, automation, human gates)
 *       → Canvas Worker extracts JSON (with workerDirective injected)
 *       → normalizeCanvasData + merge
 *
 * Outside phase `plan` the pipeline short-circuits (proceed=true, no agents),
 * so Phase 1/2 canvas updates keep their existing cost profile.
 */

import { countValidWorkflows } from '@/lib/plan-workflows';
import type { CanvasData, Workflow } from '@/lib/types';
import type { AgentMessage, PipelineLogEntry, PipelineResult, SupervisorResult } from './agents/types';
import type { CompleteJson } from './agents/llm';
import { runSupervisor } from './agents/supervisor';
import { runTopicResearch, topicNeedsResearch } from './agents/topic-research';
import { runWorkflowQA } from './agents/workflow-qa';

export interface PipelineInput {
  sessionId?: string;
  phase: string;
  history: AgentMessage[];
  canvas: Partial<CanvasData>;
}

function olog(step: PipelineLogEntry['step'], ok: boolean, detail: string, tokens?: number) {
  console.log(
    `[agent-sync][orchestration][${step}] ${ok ? 'ok' : 'fail'} ${detail}${
      tokens != null ? ` (~${tokens} tok)` : ''
    }`,
  );
}

/** Pick the tools relevant to a pain point from canvas use_cases. */
export function toolsForPainPoint(canvas: Partial<CanvasData>, painPointId: string | null): string[] {
  const ucs = canvas.use_cases || [];
  const matched = painPointId ? ucs.filter(u => u.linked_pain_point === painPointId) : ucs;
  const tools = new Set<string>();
  for (const uc of matched.length ? matched : ucs) {
    for (const t of uc.tools || []) tools.add(t);
  }
  return [...tools];
}

function findWorkflow(canvas: Partial<CanvasData>, sup: SupervisorResult): Workflow | null {
  const wfs = canvas.workflows || [];
  if (sup.target_pain_point) {
    const byPain = wfs.find(w => w.linked_pain_point === sup.target_pain_point);
    if (byPain) return byPain;
  }
  return null;
}

/** Compose the hard directive injected into the Canvas Worker extraction prompt. */
export function buildWorkerDirective(result: Omit<PipelineResult, 'workerDirective'>): string {
  if (!result.ran || !result.proceed) return '';
  const parts: string[] = ['## Orchestrierungs-Vorgaben (ZWINGEND befolgen)'];
  const sup = result.supervisor;
  if (sup) {
    if (sup.active_topic) parts.push(`- Aktuelles Thema: ${sup.active_topic}`);
    if (sup.target_pain_point) {
      parts.push(
        `- Genau EIN Workflow, verknüpft mit linked_pain_point="${sup.target_pain_point}". ${
          sup.merge_with_existing
            ? 'Bestehenden Workflow dieses Pain Points AKTUALISIEREN, keinen neuen anlegen.'
            : 'Neuen Workflow nur für diesen Pain Point.'
        }`,
      );
    }
    if (sup.instruction_for_worker) parts.push(`- ${sup.instruction_for_worker}`);
  }
  if (result.research && !result.research.skip && result.research.bullets.length) {
    parts.push(`- Recherche-Hinweise einarbeiten: ${result.research.bullets.join('; ')}`);
  }
  if (result.qa) {
    if (result.qa.issues.length) parts.push(`- QA-Probleme beheben: ${result.qa.issues.join('; ')}`);
    if (result.qa.fixed_steps?.length) {
      parts.push(
        `- Übernimm exakt diese Schritte (QA-Korrektur): ${JSON.stringify(result.qa.fixed_steps)}`,
      );
    }
  }
  return parts.join('\n');
}

/**
 * Run the orchestration pipeline. Never throws — every agent degrades to a safe
 * default so a flaky background call can't break the canvas.
 */
export async function runCanvasPipeline(
  complete: CompleteJson,
  input: PipelineInput,
): Promise<PipelineResult> {
  const logs: PipelineLogEntry[] = [];
  const base: Omit<PipelineResult, 'workerDirective'> = {
    ran: false,
    proceed: true,
    logs,
    totalTokens: 0,
  };

  // Short-circuit: orchestration only governs workflow building in phase `plan`.
  if (input.phase !== 'plan') {
    olog('pipeline', true, `short-circuit phase=${input.phase}`);
    return { ...base, workerDirective: '' };
  }

  let totalTokens = 0;

  // 1. Supervisor — alignment gate.
  const sup = await runSupervisor(complete, {
    phase: input.phase,
    history: input.history,
    canvas: {
      pain_points: input.canvas.pain_points || [],
      workflows: input.canvas.workflows || [],
    },
  });
  totalTokens += sup.tokens || 0;
  logs.push({ step: 'supervisor', ok: sup.ok, detail: `verdict=${sup.data.verdict}`, tokens: sup.tokens });
  olog('supervisor', sup.ok, `verdict=${sup.data.verdict} pain=${sup.data.target_pain_point ?? '—'}`, sup.tokens);

  if (sup.data.verdict !== 'approved') {
    const existingWorkflows = countValidWorkflows(input.canvas);
    if (input.phase === 'plan' && existingWorkflows > 0) {
      olog(
        'pipeline',
        true,
        `supervisor=${sup.data.verdict} but ${existingWorkflows} workflow(s) on canvas — proceed without halt`,
      );
      const passThrough: Omit<PipelineResult, 'workerDirective'> = {
        ran: true,
        proceed: true,
        supervisor: sup.data,
        logs,
        totalTokens,
      };
      return { ...passThrough, workerDirective: '' };
    }
    olog('pipeline', true, `defer: supervisor=${sup.data.verdict}`);
    const halted: Omit<PipelineResult, 'workerDirective'> = {
      ran: true,
      proceed: false,
      supervisor: sup.data,
      logs,
      totalTokens,
    };
    return { ...halted, workerDirective: '' };
  }

  const tools = toolsForPainPoint(input.canvas, sup.data.target_pain_point);
  const painTitle =
    (input.canvas.pain_points || []).find(p => p.id === sup.data.target_pain_point)?.title ||
    sup.data.active_topic;

  // 2. Topic Research — only when the topic plausibly benefits.
  let research = undefined as PipelineResult['research'];
  if (topicNeedsResearch(sup.data.active_topic, painTitle)) {
    const r = await runTopicResearch(complete, {
      topic: sup.data.active_topic,
      painPointTitle: painTitle,
      tools,
      history: input.history,
    });
    research = r.data;
    totalTokens += r.tokens || 0;
    logs.push({
      step: 'research',
      ok: r.ok,
      detail: r.data.skip ? 'skip' : `${r.data.bullets.length} bullets`,
      tokens: r.tokens,
    });
    olog('research', r.ok, r.data.skip ? 'skip' : `${r.data.bullets.length} bullets`, r.tokens);
  } else {
    olog('research', true, 'skipped (topic not research-y)');
  }

  // 3. Workflow QA — critic over the current/planned workflow.
  const qa = await runWorkflowQA(complete, {
    topic: sup.data.active_topic,
    painPointTitle: painTitle,
    tools,
    currentWorkflow: findWorkflow(input.canvas, sup.data),
    research,
  });
  totalTokens += qa.tokens || 0;
  logs.push({
    step: 'workflow-qa',
    ok: qa.ok,
    detail: `${qa.data.status}${qa.data.issues.length ? ` (${qa.data.issues.length} issues)` : ''}`,
    tokens: qa.tokens,
  });
  olog('workflow-qa', qa.ok, `${qa.data.status} issues=${qa.data.issues.length}`, qa.tokens);

  const assembled: Omit<PipelineResult, 'workerDirective'> = {
    ran: true,
    proceed: true,
    supervisor: sup.data,
    research,
    qa: qa.data,
    logs,
    totalTokens,
  };
  const workerDirective = buildWorkerDirective(assembled);
  olog('pipeline', true, `done agents=${logs.length} tokens=${totalTokens}`);
  return { ...assembled, workerDirective };
}
