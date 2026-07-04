/**
 * Judging is split into two halves:
 *
 *  1. MECHANICAL — deterministic code (reuses production validators). Decided
 *     here, no LLM involved.
 *  2. RUBRIC — judged by Claude Code (Opus) itself while it runs the simulation
 *     skill. The code does NOT call an LLM judge; it builds a JudgePacket, Claude
 *     reads the transcript, and posts a verdict back via recordJudgment.
 *
 * This file therefore has no model dependency — only pure functions.
 */

import {
  MECHANICAL_RULES,
  RUBRIC_RULES,
  scoreFindings,
  type JudgeContext,
} from './rules';
import type {
  Finding,
  FindingSeverity,
  RubricRuleSpec,
  RubricVerdictInput,
  RunVerdict,
} from './types';

const VALID_SEVERITY: FindingSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

/** Run every mechanical rule; a throwing rule becomes a low-severity finding. */
export function mechanicalFindings(ctx: JudgeContext): Finding[] {
  return MECHANICAL_RULES.flatMap(rule => {
    try {
      return rule.run(ctx);
    } catch (e) {
      return [{
        ruleId: rule.id,
        kind: 'mechanical' as const,
        passed: false,
        severity: 'low' as const,
        message: `Mechanical rule "${rule.id}" threw: ${e instanceof Error ? e.message : String(e)}`,
      }];
    }
  });
}

/** The rubric rules Claude Code must evaluate (handed over in the JudgePacket). */
export function rubricRuleSpecs(): RubricRuleSpec[] {
  return RUBRIC_RULES.map(r => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    targetPrompt: r.targetPrompt,
    guidance: r.guidance,
  }));
}

/** Coerce Claude Code's rubric verdicts into findings, filling any it skipped. */
export function normalizeRubricVerdicts(inputs: RubricVerdictInput[]): Finding[] {
  const byId = new Map(RUBRIC_RULES.map(r => [r.id, r]));
  const seen = new Set<string>();
  const findings: Finding[] = [];

  for (const v of inputs) {
    const rule = byId.get(v.ruleId);
    if (!rule || seen.has(v.ruleId)) continue;
    seen.add(v.ruleId);
    const sev = (v.severity && VALID_SEVERITY.includes(v.severity)) ? v.severity : rule.severity;
    findings.push({
      ruleId: rule.id,
      kind: 'rubric',
      passed: v.passed,
      severity: v.passed ? 'info' : sev,
      message: v.message || rule.title,
      evidence: v.evidence || undefined,
      suggestedFix: v.passed ? undefined : (v.suggestedFix || `Adjust the "${rule.targetPrompt}" prompt: ${rule.guidance}`),
    });
  }
  // Any rule Claude didn't return → record as an explicit "not judged" pass so
  // the verdict isn't silently distorted.
  for (const rule of RUBRIC_RULES) {
    if (seen.has(rule.id)) continue;
    findings.push({
      ruleId: rule.id,
      kind: 'rubric',
      passed: true,
      severity: 'info',
      message: `Not judged by Claude Code — treated as pass.`,
    });
  }
  return findings;
}

/** Combine mechanical + rubric findings into the final scored verdict. */
export function finalizeVerdict(
  mechanical: Finding[],
  rubric: Finding[],
): { findings: Finding[]; verdict: RunVerdict } {
  const findings = [...mechanical, ...rubric];
  return { findings, verdict: scoreFindings(findings) };
}
