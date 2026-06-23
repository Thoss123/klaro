import { describe, it, expect } from 'vitest';
import { stripInternalTags } from '@/lib/strip-internal-tags';

describe('stripInternalTags', () => {
  it('returns empty for falsy input', () => {
    expect(stripInternalTags('')).toBe('');
  });

  it('removes a paired control tag and its content', () => {
    expect(stripInternalTags('Hallo <trigger_canvas_update></trigger_canvas_update>')).toBe('Hallo');
  });

  it('removes deploy/test/credential tags with json payloads', () => {
    const t = 'Deploy jetzt <deploy_workflow>{"workflow_id":"wf_1"}</deploy_workflow>';
    expect(stripInternalTags(t)).toBe('Deploy jetzt');
  });

  it('handles streamed/partial tail fragments', () => {
    expect(stripInternalTags('Text anvas_update>')).toBe('Text');
    expect(stripInternalTags('Text _canvas_update>')).toBe('Text');
  });

  it('strips leading and trailing horizontal rules', () => {
    expect(stripInternalTags('---\nHallo\n---')).toBe('Hallo');
  });

  it('removes stray code fences', () => {
    expect(stripInternalTags('```Hallo```')).toBe('Hallo');
  });

  it('removes meta parentheticals', () => {
    expect(stripInternalTags('Antwort (steht schon im Canvas) ')).toBe('Antwort');
  });

  it('keeps normal prose untouched', () => {
    expect(stripInternalTags('Ganz normaler Satz.')).toBe('Ganz normaler Satz.');
  });

  it('removes tool_call tags and leaked tool name prefixes', () => {
    const t =
      'build_workflowprilisiert wurde. Ich starte.\n<tool_call>{"type":"build_workflow","args":{"workflow_id":"wf_1"}}</tool_call>\n<canvas_built>{"workflow_id":"wf_1"}</canvas_built>\nFertig.';
    expect(stripInternalTags(t)).toBe('prilisiert wurde. Ich starte.\nFertig.');
  });

  it('removes stream_reset markers (full and dangling)', () => {
    expect(stripInternalTags('Text <stream_reset></stream_reset> mehr')).toBe('Text  mehr');
    expect(stripInternalTags('Finale Antwort <stream_reset')).toBe('Finale Antwort');
  });

  it('removes mistral-leaked edit_workflow json blobs', () => {
    const t =
      'edit_workflowব্যক{"workflow_id": "wf_2", "instruction": "Ersetze OpenAI durch Mistral."}\nIch habe alle KI-Schritte umgestellt.';
    expect(stripInternalTags(t)).toBe('Ich habe alle KI-Schritte umgestellt.');
  });
});
