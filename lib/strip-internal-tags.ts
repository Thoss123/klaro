const LEAKED_TOOL_NAMES =
  'build_workflow|edit_workflow|deploy_workflow|test_workflow|create_workflow_plan|research_solutions|prepare_phase|request_credential';

/** Mistral leak: tool name + garbage + raw JSON in delta.content (ohne tool_call-Tags). */
export function stripLeakedToolFragments(text: string): string {
  if (!text) return '';
  let out = text;
  out = out.replace(
    new RegExp(`(?:${LEAKED_TOOL_NAMES})\\s*[^\\{]*\\{[\\s\\S]*?\\}`, 'gi'),
    '',
  );
  out = out.replace(
    /\{\s*"workflow_id"\s*:\s*"[^"]+"\s*,\s*"instruction"\s*:[\s\S]*?\}/gi,
    '',
  );
  out = out.replace(new RegExp(`(?:${LEAKED_TOOL_NAMES})\\b`, 'gi'), '');
  return out;
}

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
    'show_workflows',
    'canvas_update',
    'canvas_built',
    'options',
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
  text = text.replace(/<tool_call[\s\S]*$/gi, '');
  text = text.replace(/<canvas_built[\s\S]*$/gi, '');
  text = text.replace(/<\/?\s*tool_call[^>]*>/gi, '');
  text = text.replace(/<\/?\s*canvas_built[^>]*>/gi, '');
  text = text.replace(/\{"type":"(?:build_workflow|edit_workflow|deploy_workflow|test_workflow|create_workflow_plan|research_solutions|prepare_phase|request_credential)"[\s\S]*?\}/gi, '');
  text = text.replace(
    /\b(build_workflow|edit_workflow|deploy_workflow|test_workflow|create_workflow_plan)(?=[a-zäöüß])/gi,
    '',
  );
  text = stripLeakedToolFragments(text);

  // Leading "---" renders as horizontal rule in ReactMarkdown
  text = text.replace(/^(\s*---\s*\n?)+/, '');
  text = text.replace(/(\n\s*---\s*)+$/, '');

  // Stray markdown/code fences from the model
  text = text.replace(/^`{1,3}\s*/g, '');
  text = text.replace(/\s*`{1,3}$/g, '');

  text = text.replace(/\([^)]*(?:schon im Canvas|frag nur das, was ich noch nicht weiß)[^)]*\)\s*/gi, '');
  text = text.replace(/\n{2,}/g, '\n');

  return text.trim();
}
