import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { accessDenied, assertProjectOwner, requireUser } from '@/lib/access-control';
import { normalizeDocumentTemplate } from '@/lib/canvas-normalize';
import { buildTemplateAiInstruction, findTemplateFillStep } from '@/lib/document-template';
import { getBuiltWorkflows } from '@/lib/workflow-plans';
import type { CanvasData, DocumentTemplate, StepConfig } from '@/lib/types';

/**
 * POST /api/canvas-worker/create-template
 * Persistiert eine vom Coach gebaute Dokument-Vorlage aufs Canvas. Der Coach hat
 * den vollen Kontext (hochgeladener Muster-Text + Gespräch) und liefert content +
 * placeholders bereits fertig — hier wird NICHTS mehr generiert, nur normalisiert
 * und gespeichert (gleiches Muster wie /api/canvas-worker/create-plan).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      project_id,
      title,
      linked_workflow,
      role,
      delivery,
      target_format,
      source,
      source_file_url,
      content,
      placeholders,
      example_filled,
    } = body ?? {};

    if (!project_id || !title || !content) {
      return NextResponse.json({ error: 'project_id, title und content erforderlich' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const userResult = await requireUser(supabase);
    if (!userResult.ok) return accessDenied(userResult);

    const ownerResult = await assertProjectOwner(supabase, userResult.userId, project_id);
    if (!ownerResult.ok) return accessDenied(ownerResult);

    const { data: canvasRow, error: fetchError } = await supabase
      .from('project_canvas')
      .select('data')
      .eq('project_id', project_id)
      .single();
    if (fetchError || !canvasRow) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const canvas = (canvasRow.data as CanvasData) || ({} as CanvasData);

    const templates: DocumentTemplate[] = Array.isArray(canvas.document_templates)
      ? canvas.document_templates
      : [];

    // Bestehende Vorlage (gleicher Workflow + Titel) aktualisieren statt duplizieren.
    const existingIdx = templates.findIndex(
      t => t.title === title && (t.linked_workflow ?? '') === (linked_workflow ?? ''),
    );
    const id = existingIdx >= 0 ? templates[existingIdx].id : `tmpl_${templates.length + 1}_${Date.now().toString(36)}`;

    const normalized = normalizeDocumentTemplate(
      {
        id,
        title,
        linked_workflow,
        role,
        delivery,
        target_format,
        source,
        source_file_url,
        source_format: source === 'user_upload' ? 'pdf' : undefined,
        content,
        placeholders,
        example_filled,
      },
      templates.length,
    );
    if (!normalized) {
      return NextResponse.json({ error: 'Vorlage ungültig (content/placeholders prüfen)' }, { status: 400 });
    }

    if (existingIdx >= 0) templates[existingIdx] = normalized;
    else templates.push(normalized);
    canvas.document_templates = templates;

    // Wenn die Vorlage an einen GEBAUTEN Workflow hängt (Phase 4): die zusammengesetzte
    // KI-Anweisung (Vorlage + Platzhalter + anonymisiertes Beispiel) auf den Füll-Schritt
    // legen, damit sie im Schritt-Konfig sichtbar/editierbar ist. Nicht überschreiben,
    // wenn der Nutzer dort schon etwas eingetragen hat.
    let wiredStepId: string | undefined;
    if (normalized.linked_workflow) {
      const built = getBuiltWorkflows(canvas).find(w => w.id === normalized.linked_workflow);
      const fillStepId = built ? findTemplateFillStep(built) : undefined;
      if (built && fillStepId) {
        const allConfigs = canvas.workflow_step_configs ?? {};
        const wfConfigs = { ...(allConfigs[built.id] ?? {}) };
        const current: StepConfig = wfConfigs[fillStepId] ?? { configType: 'ai' };
        if (!current.systemPrompt?.trim()) {
          wfConfigs[fillStepId] = { ...current, systemPrompt: buildTemplateAiInstruction(normalized) };
          canvas.workflow_step_configs = { ...allConfigs, [built.id]: wfConfigs };
          wiredStepId = fillStepId;
        }
      }
    }

    const { error: updateError } = await supabase
      .from('project_canvas')
      .update({ data: canvas, updated_at: new Date().toISOString() })
      .eq('project_id', project_id);
    if (updateError) {
      return NextResponse.json({ error: 'Failed to update canvas' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      template_id: normalized.id,
      placeholder_count: normalized.placeholders.length,
      wired_step: wiredStepId ?? null,
    });
  } catch (error: unknown) {
    console.error('[create-template] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
