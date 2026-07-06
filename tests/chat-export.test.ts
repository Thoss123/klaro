import { describe, expect, it } from 'vitest';
import { parseMessageTags } from '@/lib/dev/parse-message-tags';
import { toExportedMessage } from '@/lib/dev/parse-message-tags';

describe('parseMessageTags', () => {
  it('extracts tool_call, canvas_update and phase_complete', () => {
    const content = [
      'Hallo!',
      '<tool_call>{"type":"build_workflow","args":{"workflow_id":"wf_1"}}</tool_call>',
      '<canvas_update>{"pain_points":[{"id":"pp_1","title":"Test"}]}</canvas_update>',
      '<phase_complete>diagnose</phase_complete>',
    ].join('\n');

    const parsed = parseMessageTags(content);
    expect(parsed.tool_calls).toHaveLength(1);
    expect(parsed.canvas_updates).toHaveLength(1);
    expect(parsed.phase_complete).toEqual(['diagnose']);
    expect(parsed.trigger_canvas_update).toBe(false);
  });

  it('detects trigger_canvas_update', () => {
    const parsed = parseMessageTags('Ok.\n<trigger_canvas_update></trigger_canvas_update>');
    expect(parsed.trigger_canvas_update).toBe(true);
  });

  it('toExportedMessage strips visible content but keeps raw', () => {
    const msg = toExportedMessage({
      id: '1',
      role: 'assistant',
      content: 'Hi <canvas_update>{"x":1}</canvas_update> <phase_complete>analyse</phase_complete>',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(msg.content_raw).toContain('<canvas_update>');
    expect(msg.content_visible).not.toContain('<canvas_update>');
    expect(msg.parsed.canvas_updates).toHaveLength(1);
    expect(msg.phase_complete_detected).toBe('analyse');
  });
});
