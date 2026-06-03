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
});
