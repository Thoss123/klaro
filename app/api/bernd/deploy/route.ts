import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { getRequestOrigin } from '@/lib/app-origin';
import { getBerndConfig, upsertBerndConfig } from '@/lib/bernd/config';
import { evaluateGate } from '@/lib/bernd/gate';
import { slugForScope, SCOPE_LABELS } from '@/lib/bernd/scopes';
import { buildScalarsForSlug } from '@/lib/bernd/provision';
import { deployTemplateWorkflow, findCredentialByTool } from '@/lib/template-deploy';
import { COMPANY_BASE_PATH, personaPath, readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';
import { tgSendMessage } from '@/lib/bernd/telegram';
import type { ActiveTemplate, BerndSetupState, SetupScope } from '@/lib/bernd/types';

export const maxDuration = 120;

interface DeployedFlow {
  scope: string;
  slug: string;
  workflowId: string;
}

interface FailedFlow {
  scope: string;
  error: string;
}

/**
 * POST /api/bernd/deploy { projectId: string }
 *
 * Der "Bernd einstellen"-Klick am Ende des Setup-Chats (WP2/WP3, siehe Architekturplan
 * `nein-nur-handwerker-das-mutable-charm.md` §WP5): friert `setup_state` ein, prüft das
 * regelbasierte Completion-Gate (`lib/bernd/gate.ts`) und deployt für jeden Scope mit
 * status="gewaehlt" den zugehörigen golden Flow ECHT über `deployTemplateWorkflow`
 * (Provider-Slots, Credential-Bindung, automatische Aktivierung sobald Gmail verbunden ist —
 * siehe `lib/template-deploy.ts`). Ersetzt den kaputten Auto-Deploy, den
 * `lib/bernd/provision.ts` früher beim Onboarding versucht hat (`loadWorkflowTemplate` ohne
 * `mailProvider` → ungefüllte Struct-Slots → nie ein lauffähiger Flow).
 *
 * Auth: Cookie-User + Projekt-Ownership, Muster wie `app/api/bernd/provision/route.ts`.
 *
 * Antworten:
 *   200 { ok: true, deployed: [{ scope, slug, workflowId }], failed: [{ scope, error }] }
 *       — `failed` ist NICHT fatal: einzelne Flow-Fehler brechen den Deploy der anderen
 *         gewählten Scopes nicht ab.
 *   404 { error } — keine `bernd_configs`-Zeile (Onboarding/Wizard nie durchlaufen).
 *   409 { error, missing } — Gate nicht erfüllt; `missing` = Labels der offenen Pflichtpunkte
 *       (`GateResult.missing` aus `lib/bernd/gate.ts`), 1:1 nutzbar für die Frontend-Anzeige.
 *   401/403 — Auth/Ownership (requireUser/assertProjectOwner).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const body = await req.json().catch(() => ({}));
  const { projectId } = body as { projectId?: string };

  const owner = await assertProjectOwner(supabase, auth.userId, projectId ?? '');
  if (!owner.ok) return accessDenied(owner);

  const pid = projectId as string;
  const config = await getBerndConfig(supabase, pid);
  if (!config) {
    return NextResponse.json(
      { error: 'Keine Bernd-Konfiguration gefunden — Onboarding zuerst abschließen.' },
      { status: 404 },
    );
  }
  const setupState = config.setup_state;

  // ── Verbindungsstatus live ermitteln (nie aus setup_state selbst, siehe BerndSetupState-Doku
  // in lib/bernd/types.ts — der Stand darf nie veraltet im JSONB einfrieren). ─────────────────
  const gmailCredId = await findCredentialByTool(supabase, pid, 'gmail');
  const emailConnected = Boolean(gmailCredId);

  const { data: tgLink } = await supabase
    .from('bernd_channel_links')
    .select('chat_id')
    .eq('project_id', pid)
    .eq('channel', 'telegram')
    .not('verified_at', 'is', null)
    .order('verified_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const telegramChatId = (tgLink?.chat_id as string | undefined) ?? null;
  const telegramConnected = Boolean(telegramChatId);

  const gate = evaluateGate({ setupState, emailConnected, telegramConnected });
  if (!gate.canStart) {
    return NextResponse.json(
      { error: 'Noch nicht startklar — es fehlen Pflichtpunkte.', missing: gate.missing },
      { status: 409 },
    );
  }

  const appBaseUrl = getRequestOrigin(req);
  const gewerk = setupState.profil?.gewerk?.trim() || config.gewerk || 'sonstiges';
  const personaFile = personaPath(setupState.profil?.firmenname?.trim() || gewerk);
  const gewaehlteScopes = (setupState.scopes ?? []).filter((scope) => scope.status === 'gewaehlt');

  const deployed: DeployedFlow[] = [];
  const failed: FailedFlow[] = [];
  const activeTemplates: ActiveTemplate[] = [...(config.active_templates ?? [])];

  for (const scope of gewaehlteScopes) {
    const slug = slugForScope(scope.id);
    if (!slug) {
      failed.push({ scope: scope.id, error: `Unbekannte Aufgabe: ${scope.id}` });
      continue;
    }
    try {
      const overrides = ablaufToScalarOverrides(setupState.ablauf?.[scope.id]);
      const scalars = buildScalarsForSlug({ slug, gewerk, personaFile, appBaseUrl, projectId: pid, overrides });
      const result = await deployTemplateWorkflow(supabase, {
        slug,
        userId: auth.userId,
        projectId: pid,
        appBaseUrl,
        mailProvider: 'gmail',
        scalars,
      });
      if (!result.ok) {
        failed.push({ scope: scope.id, error: result.error || 'Deploy fehlgeschlagen.' });
        continue;
      }
      deployed.push({ scope: scope.id, slug, workflowId: result.n8nId });

      const entry: ActiveTemplate = { slug, n8n_workflow_id: result.n8nId, scalars };
      const idx = activeTemplates.findIndex((t) => t.slug === slug);
      if (idx === -1) activeTemplates.push(entry);
      else activeTemplates[idx] = entry;
    } catch (e: unknown) {
      failed.push({ scope: scope.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const steckbrief = {
    ...(config.steckbrief ?? {}),
    kann: gewaehlteScopes.map((scope) => SCOPE_LABELS[scope.id] ?? scope.id),
  };

  await upsertBerndConfig(supabase, {
    userId: auth.userId,
    projectId: pid,
    patch: { gewerk, status: 'active', active_templates: activeTemplates, steckbrief },
  });

  await updateCompanyBaseFromSetup(supabase, {
    userId: auth.userId,
    projectId: pid,
    setupState,
    gewaehlteScopes,
  });

  if (telegramChatId) {
    // Best-effort — ein fehlgeschlagener Push darf den Deploy-Erfolg nicht kaputt machen.
    await tgSendMessage(
      telegramChatId,
      'Ich bin startklar 👋 Ich behalte dein Postfach im Blick und melde mich hier, sobald ich einen Entwurf für dich vorbereitet habe.',
    );
  }

  return NextResponse.json({ ok: true, deployed, failed });
}

/**
 * Ablauf-Antworten (`setup_state.ablauf[scope]`) generisch als Skalar-Overrides anbieten: passt
 * eine Frage (großgeschrieben) auf einen Slot-Key im golden JSON, wird die Nutzerantwort direkt
 * übernommen. Aktuell hat keines der vier golden Templates dafür einen passenden Slot (siehe
 * knowledge/templates/workflows/*.json) — überzählige Skalare werden von
 * `lib/template-loader.ts#applySlots` ignoriert, das ist also schon vorbereitet für künftige
 * Slots (z.B. FOLLOWUP_TAGE aus `erst_nachfassen_nach_tagen`), ohne dass diese Route dafür
 * angepasst werden müsste.
 */
function ablaufToScalarOverrides(ablauf: Record<string, string> | undefined): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const [frage, antwort] of Object.entries(ablauf ?? {})) {
    if (antwort?.trim()) overrides[frage.toUpperCase()] = antwort.trim();
  }
  return overrides;
}

/**
 * Profil-Fakten aus dem Setup-Chat als eigenen Abschnitt an `rules/company_base.md` anhängen.
 * Nutzt bewusst NICHT `buildCompanyBaseContent` aus `lib/bernd/provision.ts` (das ist auf die
 * Wizard-Feldform `BerndWizardData` zugeschnitten) — `setup_state` hat eine andere, freiere
 * Form (siehe `BerndSetupState` in lib/bernd/types.ts), daher hier ein additiver Abschnitt
 * statt eines vollständigen Neuaufbaus der Datei.
 */
async function updateCompanyBaseFromSetup(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; setupState: BerndSetupState; gewaehlteScopes: SetupScope[] },
): Promise<void> {
  const { userId, projectId, setupState, gewaehlteScopes } = args;
  const { profil, regeln, ziele } = setupState;

  const lines: string[] = [];
  if (profil?.firmenname?.trim()) lines.push(`- Firmenname: ${profil.firmenname.trim()}`);
  if (profil?.standort?.trim()) lines.push(`- Standort: ${profil.standort.trim()}`);
  if (profil?.mitarbeiter?.trim()) lines.push(`- Mitarbeiter: ${profil.mitarbeiter.trim()}`);
  if (profil?.ton?.trim()) lines.push(`- Ton: ${profil.ton.trim()}`);
  if (gewaehlteScopes.length > 0) {
    lines.push(`- Übernommene Aufgaben: ${gewaehlteScopes.map((scope) => SCOPE_LABELS[scope.id] ?? scope.id).join(', ')}`);
  }
  for (const regel of regeln ?? []) lines.push(`- Regel: ${regel}`);
  for (const ziel of ziele ?? []) lines.push(`- Ziel: ${ziel}`);

  if (lines.length === 0) return; // nichts Neues aus dem Setup-Chat zu vermerken

  const existing = await readWorkspaceFile(supabase, projectId, COMPANY_BASE_PATH);
  const section = ['## Aus dem Einstellungsgespräch', ...lines].join('\n');
  const content = existing.trim() ? `${existing.trimEnd()}\n\n${section}\n` : `${section}\n`;

  await writeWorkspaceFile(supabase, {
    userId,
    projectId,
    path: COMPANY_BASE_PATH,
    content,
    updatedBy: 'bernd_deploy',
  });
}
