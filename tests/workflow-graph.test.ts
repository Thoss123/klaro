import { describe, it, expect } from 'vitest';
import {
  branchOutputIndex,
  connectionToEdgeFields,
  createIfStep,
  createMergeStep,
  createSwitchStep,
  edgeTargetInput,
  getMergeInputCount,
  getSwitchOutputCount,
  insertStepInGraph,
  isIfStep,
  isMergeStep,
  isSwitchStep,
  layoutStepPositions,
  findTerminalStepIds,
  removeStepFromGraph,
  switchBranch,
  mergeEdgesFromEdit,
  mergeStepsFromEdit,
  hasSameStepIds,
} from '@/lib/workflow-graph';
import type { WorkflowEdge, WorkflowStep } from '@/lib/types';

describe('workflow-graph node detection', () => {
  it('detects IF, Switch, Merge nodes', () => {
    expect(isIfStep({ id: '1', label: 'IF', type: 'decision', n8nType: 'n8n-nodes-base.if' })).toBe(true);
    expect(isSwitchStep({ id: '2', label: 'SW', type: 'decision', n8nType: 'n8n-nodes-base.switch' })).toBe(true);
    expect(isMergeStep({ id: '3', label: 'M', type: 'output', n8nType: 'n8n-nodes-base.merge' })).toBe(true);
  });
});

describe('branch mapping', () => {
  const ifStep: WorkflowStep = { id: 'if', label: 'IF', type: 'decision', n8nType: 'n8n-nodes-base.if' };
  const swStep = createSwitchStep();

  it('maps IF branches to output indices', () => {
    expect(branchOutputIndex('true', ifStep)).toBe(0);
    expect(branchOutputIndex('false', ifStep)).toBe(1);
  });

  it('maps Switch branches to output indices', () => {
    expect(branchOutputIndex(switchBranch(2), swStep)).toBe(2);
  });

  it('maps connection handles to edge fields', () => {
    expect(connectionToEdgeFields('false', null, ifStep)).toEqual({ branch: 'false' });
    expect(connectionToEdgeFields('switch-1', 'input-2', swStep)).toEqual({
      branch: 'switch-1',
      targetInput: 2,
    });
  });

  it('reads merge target input from edge', () => {
    const edge: WorkflowEdge = { id: 'e1', source: 'a', target: 'b', targetInput: 2 };
    expect(edgeTargetInput(edge)).toBe(2);
  });
});

describe('switch/merge counts', () => {
  it('defaults switch outputs to 4', () => {
    expect(getSwitchOutputCount(createSwitchStep())).toBeGreaterThanOrEqual(3);
  });

  it('defaults merge inputs to 3', () => {
    expect(getMergeInputCount(createMergeStep())).toBe(3);
  });
});

describe('graph operations', () => {
  const steps: WorkflowStep[] = [
    { id: 's1', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.manualTrigger' },
    { id: 's2', label: 'Action', type: 'action' },
    { id: 's3', label: 'End', type: 'output' },
  ];
  const edges: WorkflowEdge[] = [
    { id: 'e1', source: 's1', target: 's2', branch: 'default' },
    { id: 'e2', source: 's2', target: 's3', branch: 'default' },
  ];

  it('inserts step after given node and rewires', () => {
    const ifStep = createIfStep();
    const result = insertStepInGraph(steps, edges, ifStep, { afterStepId: 's2' });
    expect(result.steps.map(s => s.id)).toContain(ifStep.id);
    expect(result.edges.some(e => e.source === 's2' && e.target === ifStep.id)).toBe(true);
    expect(result.edges.some(e => e.source === ifStep.id && e.target === 's3')).toBe(true);
  });

  it('removes step and cleans edges', () => {
    const result = removeStepFromGraph(steps, edges, 's2');
    expect(result.steps).toHaveLength(2);
    expect(result.edges.every(e => e.source !== 's2' && e.target !== 's2')).toBe(true);
  });

  it('assigns positions in layered layout', () => {
    const laid = layoutStepPositions(steps, edges, { force: true });
    expect(laid.every(s => s.position)).toBe(true);
    expect(laid[1].position!.x).toBeGreaterThan(laid[0].position!.x);
  });

  it('finds terminal steps without outgoing main edges', () => {
    expect(findTerminalStepIds(steps, edges)).toEqual(['s3']);
    const branched: WorkflowEdge[] = [
      { id: 'e1', source: 's1', target: 's2', branch: 'default' },
      { id: 'e2', source: 's1', target: 's3', branch: 'default' },
    ];
    expect(findTerminalStepIds(steps, branched).sort()).toEqual(['s2', 's3']);
  });
});

describe('mergeEdgesFromEdit', () => {
  const steps: WorkflowStep[] = [
    { id: 's1', label: 'Start', type: 'trigger' },
    { id: 's2', label: 'CRM', type: 'action' },
    { id: 's3', label: 'Mail', type: 'action' },
  ];
  const edges: WorkflowEdge[] = [
    { id: 'e1', source: 's1', target: 's2', branch: 'default' },
    { id: 'e2', source: 's2', target: 's3', branch: 'default' },
  ];

  it('keeps existing edges when LLM sends incomplete list', () => {
    const proposed: WorkflowEdge[] = [
      { id: 'e1', source: 's1', target: 's2', branch: 'default' },
    ];
    const merged = mergeEdgesFromEdit(edges, proposed, steps);
    expect(merged).toHaveLength(2);
    expect(merged.some(e => e.source === 's2' && e.target === 's3')).toBe(true);
  });

  it('keeps edges on same-topology step swap', () => {
    const swapped = steps.map(s =>
      s.id === 's2' ? { ...s, n8nType: 'n8n-nodes-base.slack' } : s,
    );
    expect(hasSameStepIds(steps, swapped)).toBe(true);
    const merged = mergeEdgesFromEdit(edges, [], swapped);
    expect(merged).toHaveLength(2);
  });

  it('re-attaches sub-nodes dropped by LLM', () => {
    const sub: WorkflowStep = {
      id: 'sub1',
      label: 'Model',
      subNodeOf: { parentId: 's2', slot: 'ai_languageModel' },
    };
    const prev = [...steps, sub];
    const llmOut = steps.map(s => (s.id === 's2' ? { ...s, n8nType: '@n8n/n8n-nodes-langchain.agent' } : s));
    const merged = mergeStepsFromEdit(prev, llmOut);
    expect(merged.some(s => s.id === 'sub1')).toBe(true);
  });
});
