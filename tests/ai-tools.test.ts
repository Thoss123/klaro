import { describe, expect, it } from 'vitest';
import { SchemaType } from '@google/generative-ai';
import { getToolsForPhase, toGeminiTools } from '@/lib/ai-tools';

describe('toGeminiTools', () => {
  it('includes items for array properties (create_workflow_plan.steps)', () => {
    const tools = getToolsForPhase('umsetzung');
    const planTool = tools.find(t => t.name === 'create_workflow_plan');
    expect(planTool).toBeDefined();

    const gemini = toGeminiTools(tools);
    const decl = gemini.find(d => d.name === 'create_workflow_plan');
    expect(decl).toBeDefined();

    const steps = decl!.parameters!.properties!.steps as any;
    expect(steps.type).toBe(SchemaType.ARRAY);
    expect(steps.items).toBeDefined();

    const stepItems = steps.items as any;
    expect(stepItems.type).toBe(SchemaType.OBJECT);
    expect(stepItems.properties).toBeDefined();
    expect((stepItems.properties as any).label).toBeDefined();
  });

  it('includes items for tools_mentioned in research_solutions (plan phase)', () => {
    const tools = getToolsForPhase('plan');
    const research = tools.find(t => t.name === 'research_solutions');
    expect(research).toBeDefined();

    const gemini = toGeminiTools(tools);
    const decl = gemini.find(d => d.name === 'research_solutions');
    const mentioned = decl!.parameters!.properties!.tools_mentioned as any;
    expect(mentioned.type).toBe(SchemaType.ARRAY);
    expect(mentioned.items).toBeDefined();
  });
});
