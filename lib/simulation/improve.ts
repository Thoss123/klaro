/**
 * The self-improvement loop.
 *
 *  aggregate(): scan recent runs' findings, cluster the failures by rule, and
 *    write one proposed prompt-change per recurring problem into sim_improvements.
 *    The actual prompt edit is intentionally NOT auto-applied — a human (or
 *    Claude Code) makes the edit, which keeps the coach's core prompts under
 *    review. The aggregation just tells you exactly what to change and why.
 *
 *  verify(): after the prompt was edited and the SAME persona re-run, compare
 *    the targeted rule's result before/after and mark the improvement
 *    verified or rejected. That closes the loop.
 */

import { MECHANICAL_RULES, RUBRIC_RULES } from './rules';
import {
  getFindings,
  listRuns,
  markImprovement,
  upsertImprovements,
} from './store';

interface RuleMeta {
  targetPrompt: string;
  title: string;
}

const RULE_META: Record<string, RuleMeta> = {
  ...Object.fromEntries(
    MECHANICAL_RULES.map(r => [r.id, { targetPrompt: r.targetPrompt, title: r.id }]),
  ),
  ...Object.fromEntries(RUBRIC_RULES.map(r => [r.id, { targetPrompt: r.targetPrompt, title: r.title }])),
};

export interface AggregateResult {
  runsScanned: number;
  clusters: number;
}

/**
 * Cluster failed findings across the most recent `limit` completed runs and
 * write a proposed prompt-change per cluster.
 */
export async function aggregateImprovements(limit = 20): Promise<AggregateResult> {
  const runs = (await listRuns(limit)).filter(r => r.status === 'done');
  const fails = new Map<string, { count: number; quotes: string[]; fix: string }>();

  for (const run of runs) {
    const findings = await getFindings(run.id);
    for (const f of findings) {
      if (f.passed) continue;
      const entry = fails.get(f.ruleId) ?? { count: 0, quotes: [], fix: f.suggestedFix ?? '' };
      entry.count += 1;
      if (f.evidence && entry.quotes.length < 5) entry.quotes.push(f.evidence);
      if (!entry.fix && f.suggestedFix) entry.fix = f.suggestedFix;
      fails.set(f.ruleId, entry);
    }
  }

  const rows = [...fails.entries()].map(([ruleId, agg]) => {
    const meta = RULE_META[ruleId] ?? { targetPrompt: 'shared', title: ruleId };
    return {
      rule_id: ruleId,
      title: meta.title,
      target_prompt: meta.targetPrompt,
      fail_count: agg.count,
      run_count: runs.length,
      example_quotes: agg.quotes,
      proposed_change:
        agg.fix ||
        `Tighten the "${meta.targetPrompt}" prompt so rule "${ruleId}" stops failing.`,
    };
  });

  await upsertImprovements(rows);
  return { runsScanned: runs.length, clusters: rows.length };
}

/**
 * Verify a fix: compare a rule's outcome between the baseline run (before the
 * prompt edit) and a fresh run of the same persona (after). Marks the
 * improvement verified if the rule now passes, rejected if it still fails.
 */
export async function verifyImprovement(input: {
  improvementId: string;
  ruleId: string;
  baselineRunId: string;
  newRunId: string;
}): Promise<{ status: 'verified' | 'rejected'; note: string }> {
  const [before, after] = await Promise.all([
    getFindings(input.baselineRunId),
    getFindings(input.newRunId),
  ]);
  const failedBefore = before.some(f => f.ruleId === input.ruleId && !f.passed);
  const failedAfter = after.some(f => f.ruleId === input.ruleId && !f.passed);

  const status: 'verified' | 'rejected' = !failedAfter ? 'verified' : 'rejected';
  const note = `Rule "${input.ruleId}": ${failedBefore ? 'FAIL' : 'pass'} (baseline ${input.baselineRunId.slice(0, 8)}) → ${failedAfter ? 'FAIL' : 'pass'} (after ${input.newRunId.slice(0, 8)}).`;

  await markImprovement(input.improvementId, {
    status,
    verifiedByRunId: input.newRunId,
    verificationNote: note,
  });
  return { status, note };
}
