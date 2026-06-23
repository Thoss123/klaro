import type { DocumentTemplate, Workflow, WorkflowStep } from '@/lib/types';

/**
 * Baut den System-Prompt, den die Laufzeit-KI bekommt, um aus der Vorlage das fertige
 * Dokument/die Nachricht zu erzeugen. Enthält die Vorlage (mit {{platzhaltern}}), die
 * Platzhalter-Erklärung und — falls vorhanden — ein vollständig ausgefülltes,
 * anonymisiertes Beispiel als Few-Shot-Orientierung für Stil & Format.
 */
export function buildTemplateAiInstruction(template: DocumentTemplate): string {
  const lines: string[] = [];

  const what =
    template.delivery === 'text'
      ? 'eine fertige Nachricht/E-Mail'
      : 'ein fertiges Dokument';
  lines.push(
    `Du erzeugst ${what} nach der folgenden Vorlage. Übernimm den festen Text wörtlich und ersetze jeden Platzhalter {{…}} durch den passenden, zur Laufzeit gelieferten Wert. Behalte Ton, Aufbau und Formatierung exakt bei. Erfinde keine zusätzlichen Inhalte.`,
  );

  lines.push('', '## Vorlage', template.content.trim());

  if (template.placeholders.length > 0) {
    lines.push('', '## Platzhalter (einsetzen)');
    for (const p of template.placeholders) {
      const parts = [`- {{${p.key}}} — ${p.label}`];
      if (p.description) parts.push(`(${p.description})`);
      if (p.example) parts.push(`z.B. ${p.example}`);
      lines.push(parts.join(' '));
    }
  }

  if (template.example_filled && template.example_filled.trim()) {
    lines.push(
      '',
      '## Beispiel (anonymisiert — nur Stil & Format als Orientierung, Daten NICHT übernehmen)',
      template.example_filled.trim(),
    );
  }

  return lines.join('\n');
}

/**
 * Findet den Schritt eines (gebauten) Workflows, der die Vorlage füllt: bevorzugt einen
 * KI-Schritt, sonst einen Output-Schritt. Gibt die Step-ID zurück oder undefined.
 */
export function findTemplateFillStep(workflow: Workflow): string | undefined {
  const isAi = (s: WorkflowStep) =>
    s.type === 'ai' || /openai|langchain|\.openAi|anthropic|mistral|gemini/i.test(s.n8nType ?? '');
  const ai = workflow.steps.find(isAi);
  if (ai) return ai.id;
  const output = workflow.steps.find(s => s.type === 'output');
  return output?.id;
}
