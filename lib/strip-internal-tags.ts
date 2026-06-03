/**
 * Removes internal control tags from coach messages (chat display + API history).
 * Handles streamed/partial tags (e.g. "anvas_update>" when "<trigger_c" was split).
 */
export function stripInternalTags(content: string): string {
  if (!content) return '';

  let text = content;

  const paired = [
    'trigger_canvas_update',
    'phase_complete',
    'prepare_phase',
    'tool_call',
    'request_credential',
    'deploy_workflow',
    'test_workflow',
    'activate_workflow',
    'canvas_update',
  ];
  for (const tag of paired) {
    text = text.replace(
      new RegExp(`<\\s*${tag}\\s*>[\\s\\S]*?(<\\s*\\/\\s*${tag}\\s*>|$)`, 'gi'),
      ''
    );
    text = text.replace(new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'gi'), '');
    text = text.replace(new RegExp(`<\\s*${tag}[^>]*>`, 'gi'), '');
  }

  text = text.replace(/<\/?\s*trigger_canvas_update[^>]*>/gi, '');
  text = text.replace(/trigger_canvas_update/gi, '');
  text = text.replace(/<\/?\s*prepare_phase[^>]*>/gi, '');
  text = text.replace(/_canvas_update>/g, '');
  text = text.replace(/anvas_update>/g, '');

  // Leading "---" renders as horizontal rule in ReactMarkdown
  text = text.replace(/^(\s*---\s*\n?)+/, '');
  text = text.replace(/(\n\s*---\s*)+$/, '');

  // Stray markdown/code fences from the model
  text = text.replace(/^`{1,3}\s*/g, '');
  text = text.replace(/\s*`{1,3}$/g, '');

  text = text.replace(/\([^)]*(?:schon im Canvas|frag nur das, was ich noch nicht weiß)[^)]*\)\s*/gi, '');

  return text.trim();
}
