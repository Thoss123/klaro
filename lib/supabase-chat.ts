import { createSupabaseBrowserClient } from './supabase-browser'
import { Message, CanvasData, OnboardingData, Project } from './types'
import { numberedSessionTitle } from './session-title'
import type { PostgrestError } from '@supabase/supabase-js'

/** PostgrestError serializes poorly in console — use for logs. */
export function formatSupabaseError(error: PostgrestError | null | undefined): string {
  if (!error) return 'unknown'
  const parts = [
    error.message,
    error.code ? `code=${error.code}` : '',
    error.details,
    error.hint,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' | ') : String(error)
}

function isSessionAccessDenied(error: PostgrestError): boolean {
  const msg = (error.message || '').toLowerCase()
  return (
    error.code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('violates row-level security policy')
  )
}

/** True when RLS allows read/write on this session for the current user. */
export async function canAccessSession(sessionId: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return false
    console.warn('Session access check failed:', formatSupabaseError(error))
    return false
  }
  return !!data?.id
}

export type SessionSummary = {
  id: string
  title: string | null
  phase: string | null
  project_id: string | null
  created_at: string
}

// ---- Projects ----

/**
 * Idempotent: gets the user's oldest project (or creates one named "Mein Projekt"),
 * then migrates every session that still has project_id = NULL to it.
 * Call this on dashboard load and on every new-session creation path.
 */
export async function ensureDefaultProject(userId: string): Promise<string> {
  const supabase = createSupabaseBrowserClient()

  // Explicitly check the error — only create when we're certain no project exists,
  // never on a network error or bad request (that would silently create duplicates).
  const { data: existing, error: lookupError } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (lookupError) throw lookupError   // surface the real problem, don't create

  let projectId: string

  if (existing) {
    projectId = existing.id
  } else {
    // Truly no project — create the default one
    const { data: created, error: createError } = await supabase
      .from('projects')
      .insert({ user_id: userId, name: 'Mein Projekt' })
      .select('id')
      .single()
    if (createError) throw createError
    projectId = created.id
  }

  // One-shot migration: assign all orphaned sessions (project_id IS NULL) to this project
  await supabase
    .from('sessions')
    .update({ project_id: projectId })
    .eq('user_id', userId)
    .is('project_id', null)

  return projectId
}

export async function updateProjectName(projectId: string, name: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('projects')
    .update({ name: name.trim() || 'Mein Projekt' })
    .eq('id', projectId)
  if (error) throw error
}

export async function deleteProject(projectId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  // Orphan the sessions first so they don't cascade-block the delete
  await supabase
    .from('sessions')
    .update({ project_id: null })
    .eq('project_id', projectId)
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
  if (error) throw error
}

export async function createProject(userId: string, name: string): Promise<string> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function loadProjects(): Promise<Project[]> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// ---- Sessions ----

export async function createSession(onboarding: OnboardingData, userId: string, phase: string = 'diagnose', memory?: string, initialCanvas?: CanvasData, projectId?: string): Promise<string> {
  const supabase = createSupabaseBrowserClient()

  let samePhaseCount = 0
  if (projectId) {
    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('phase', phase)
    samePhaseCount = count ?? 0
  }
  const defaultTitle = numberedSessionTitle(phase, samePhaseCount)

    const { data, error } = await supabase
    .from('sessions')
    .insert({
      project_id: projectId || null,
      ziel: onboarding.ziel,
      ki_erfahrung: onboarding.ki_erfahrung,
      wer_setzt_um: onboarding.wer_setzt_um,
      hindernis: onboarding.hindernis,
      branche: onboarding.branche,
      tempo: onboarding.tempo,
      unternehmensgroesse: onboarding.unternehmensgroesse,
      vorname: onboarding.vorname || onboarding.username || null,
      firmenname: onboarding.firmenname || null,
      rolle_im_unternehmen: onboarding.rolle_im_unternehmen || null,
      phase: phase,
      memory: memory || null,
      title: defaultTitle,
      user_id: userId,
      welcome_sent: false
    })
    .select('id')
    .single()

  if (error) throw error
  
  // Create canvas for this session
  const canvasPayload = initialCanvas
    ? { ...initialCanvas, phase: phase }
    : { pain_points: [], use_cases: [], workflows: [], documents: [], phase: phase };

  await supabase.from('canvas').insert({
    session_id: data.id,
    data: canvasPayload
  })

  // Ensure a project_canvas exists for this project
  if (projectId) {
    const { data: existingPC } = await supabase
      .from('project_canvas')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle()

    if (!existingPC) {
      await supabase.from('project_canvas').insert({
        project_id: projectId,
        data: canvasPayload
      })
    }
  }

  return data.id
}

export async function loadSessions(projectId?: string): Promise<SessionSummary[]> {
  const supabase = createSupabaseBrowserClient()
  let query = supabase
    .from('sessions')
    .select('id, title, phase, project_id, created_at')
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function loadSessionMessages(sessionId: string): Promise<Message[]> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map(m => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    created_at: m.created_at,
  }))
}

export async function loadSessionCanvas(sessionId: string): Promise<CanvasData | null> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('canvas')
    .select('data')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.warn('Error loading session canvas:', formatSupabaseError(error))
    return null
  }
  return data?.data as CanvasData | null
}

export async function loadSessionOnboarding(sessionId: string): Promise<OnboardingData | null> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('ziel, ki_erfahrung, wer_setzt_um, hindernis, branche, tempo, unternehmensgroesse, vorname, firmenname, rolle_im_unternehmen, memory')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.warn('Error loading onboarding:', formatSupabaseError(error))
    }
    return null
  }
  return data as OnboardingData
}

export async function markWelcomeSent(sessionId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('sessions')
    .update({ welcome_sent: true })
    .eq('id', sessionId)

  if (error) console.warn('Error updating welcome_sent:', formatSupabaseError(error))
}

export async function isWelcomeSent(sessionId: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('welcome_sent')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) return false
  return data?.welcome_sent || false
}

// ---- Messages ----

export async function saveMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role, content })

  if (error) {
    if (isSessionAccessDenied(error)) {
      console.warn(`Message not saved (session ${sessionId} not writable):`, formatSupabaseError(error))
      return
    }
    console.error('Error saving message:', formatSupabaseError(error))
    return
  }

  const { error: touchError } = await supabase
    .from('sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (touchError && !isSessionAccessDenied(touchError)) {
    console.warn('Error updating session timestamp:', formatSupabaseError(touchError))
  }
}

// ---- Message Feedback (Daumen hoch/runter + Umfrage) ----

export type FeedbackContextMessage = { role: 'user' | 'assistant'; content: string }

/**
 * Insert a thumbs-up/down rating with phase + the last 5 chat messages as
 * context (for later AI analysis). Returns the row id so the survey popup
 * can attach problem/comment afterwards. Fails soft (returns null).
 */
export async function saveMessageFeedback(params: {
  sessionId: string | null
  messageId: string
  rating: 'up' | 'down'
  phase: string
  context: FeedbackContextMessage[]
}): Promise<string | null> {
  const supabase = createSupabaseBrowserClient()
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('message_feedback')
    .insert({
      session_id: params.sessionId,
      user_id: userData?.user?.id ?? null,
      message_id: params.messageId,
      rating: params.rating,
      phase: params.phase,
      context: params.context,
    })
    .select('id')
    .single()

  if (error) {
    console.warn('Error saving message feedback:', formatSupabaseError(error))
    return null
  }
  return data.id
}

/** Attach survey results (rating switch, problem choice, free text) to an existing feedback row. */
export async function updateMessageFeedback(
  feedbackId: string,
  fields: { rating?: 'up' | 'down'; problem?: string; comment?: string }
): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('message_feedback')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', feedbackId)

  if (error) console.warn('Error updating message feedback:', formatSupabaseError(error))
}

// ---- Phasen-Feedback ("Wie hat es dir gefallen?") + Support-Meldungen ----

/**
 * Speichert das Phasen-Feedback-Popup (Zufriedenheit + Nutzen + optionaler
 * Freitext) für eine abgeschlossene Phase. user_id aus der aktuellen Session.
 * Fail-soft.
 */
export async function savePhaseFeedback(params: {
  projectId: string | null
  sessionId: string | null
  phase: string
  satisfaction: string
  helpfulness: string
  comment?: string
}): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('phase_feedback').insert({
    project_id: params.projectId,
    session_id: params.sessionId,
    user_id: userData?.user?.id ?? null,
    phase: params.phase,
    satisfaction: params.satisfaction,
    helpfulness: params.helpfulness,
    comment: params.comment?.trim() || null,
  })
  if (error) console.warn('Error saving phase feedback:', formatSupabaseError(error))
}

/**
 * Prüft, ob für dieses Projekt + diese Phase bereits Feedback existiert
 * (Dedupe — kein Doppel-Popup). Fail-soft: bei Fehler false.
 */
export async function hasPhaseFeedback(projectId: string, phase: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('phase_feedback')
    .select('id')
    .eq('project_id', projectId)
    .eq('phase', phase)
    .limit(1)
  if (error) {
    console.warn('Error checking phase feedback:', formatSupabaseError(error))
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * Speichert eine Problem-Meldung aus dem Hilfe-Button. message ist Pflicht,
 * der Rest ist Kontext für die Triage. Fail-soft.
 */
export async function saveSupportRequest(params: {
  sessionId: string | null
  projectId: string | null
  phase: string | null
  category: string
  message: string
  url: string
  userAgent: string
}): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('support_requests').insert({
    user_id: userData?.user?.id ?? null,
    session_id: params.sessionId,
    project_id: params.projectId,
    phase: params.phase,
    category: params.category,
    message: params.message.trim(),
    url: params.url,
    user_agent: params.userAgent,
  })
  if (error) console.warn('Error saving support request:', formatSupabaseError(error))
}

// ---- Canvas (Session-level, legacy) ----

export async function saveCanvas(sessionId: string, canvasData: CanvasData): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('canvas')
    .upsert({ session_id: sessionId, data: canvasData, updated_at: new Date().toISOString() }, { onConflict: 'session_id' })

  if (error) {
    if (isSessionAccessDenied(error)) {
      console.warn(`Canvas not saved (session ${sessionId} not writable):`, formatSupabaseError(error))
      return
    }
    console.error('Error saving canvas:', formatSupabaseError(error))
  }
}

// ---- Project Canvas (project-bound, persists across all chats) ----

export async function loadProjectCanvas(projectId: string): Promise<CanvasData | null> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('project_canvas')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.warn('Error loading project canvas:', formatSupabaseError(error))
    return null
  }
  return data?.data as CanvasData | null
}

export async function saveProjectCanvas(projectId: string, canvasData: CanvasData): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const attempt = async () =>
    supabase
      .from('project_canvas')
      .upsert(
        { project_id: projectId, data: canvasData, updated_at: new Date().toISOString() },
        { onConflict: 'project_id' }
      )

  let { error } = await attempt()
  // Transiente Netzwerkfehler ("Failed to fetch") einmal wiederholen — Edits dürfen nicht verloren gehen.
  if (error && /failed to fetch|network|fetch failed/i.test(error.message || '')) {
    await new Promise(r => setTimeout(r, 400))
    ;({ error } = await attempt())
  }

  if (error) {
    if (isSessionAccessDenied(error)) {
      console.warn(`Project canvas not saved (project ${projectId} not writable):`, formatSupabaseError(error))
      return
    }
    console.error('Error saving project canvas:', formatSupabaseError(error))
  }
}

// ---- Project Memory ----

export type ProjectMemoryEntry = {
  id: string
  phase: string
  summary: string
  created_at: string
}

export async function loadProjectMemory(projectId: string): Promise<ProjectMemoryEntry[]> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('project_memory')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error loading project memory:', error)
    return []
  }
  return data || []
}

export async function saveProjectMemory(projectId: string, phase: string, summary: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  // Upsert by project + phase so we don't duplicate
  const { data: existing } = await supabase
    .from('project_memory')
    .select('id')
    .eq('project_id', projectId)
    .eq('phase', phase)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('project_memory')
      .update({ summary, created_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('project_memory')
      .insert({ project_id: projectId, phase, summary })
  }
}

/**
 * Cross-project context for returning users: what the company does, which
 * workflows already run, who implemented last time — compact German text the
 * coach uses for situation-aware Phase 1 (no re-asking known facts, check-in
 * "same implementer? which department?"). Returns null for first-time users.
 * RLS scopes the project list to the logged-in user.
 */
export async function loadCrossProjectContext(currentProjectId: string | null): Promise<string | null> {
  const supabase = createSupabaseBrowserClient()
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  if (error || !projects?.length) return null
  const others = projects.filter(p => p.id !== currentProjectId).slice(0, 5)
  if (!others.length) return null

  const blocks: string[] = []
  for (const p of others) {
    try {
      const [{ data: pc }, { data: mems }] = await Promise.all([
        supabase.from('project_canvas').select('data').eq('project_id', p.id).maybeSingle(),
        supabase
          .from('project_memory')
          .select('phase, summary')
          .eq('project_id', p.id)
          .order('created_at', { ascending: true }),
      ])
      const canvas = (pc?.data ?? null) as CanvasData | null
      const lines: string[] = [`Projekt „${p.name}“:`]

      const company = canvas?.company
      if (company?.offer) {
        lines.push(
          `- Unternehmen/Angebot: ${company.offer}` +
            (company.target_customers ? ` (Zielkunden: ${company.target_customers})` : ''),
        )
      }
      const impl = canvas?.implementer
      if (impl?.who) {
        lines.push(`- Umsetzer damals: ${impl.who}${impl.skill_level ? ` (Skill: ${impl.skill_level})` : ''}`)
      }
      const workflowTitles = (canvas?.workflows || []).map(w => w.title).filter(Boolean)
      if (workflowTitles.length) lines.push(`- Gebaute Workflows: ${workflowTitles.join(' · ')}`)
      const painPointTitles = (canvas?.pain_points || [])
        .map(pp => (pp as { title?: string }).title)
        .filter(Boolean)
      if (painPointTitles.length) lines.push(`- Behandelte Pain Points: ${painPointTitles.slice(0, 6).join(' · ')}`)
      if (canvas?.phase) lines.push(`- Erreichte Phase: ${canvas.phase}`)

      // Memory summaries are long — only the most recent one, trimmed.
      const lastMem = mems?.length ? mems[mems.length - 1] : null
      if (lastMem?.summary) {
        lines.push(`- Letzte Zusammenfassung (${lastMem.phase}): ${String(lastMem.summary).slice(0, 600)}`)
      }

      if (lines.length > 1) blocks.push(lines.join('\n'))
    } catch {
      // Skip a broken project rather than losing the whole context.
    }
  }

  return blocks.length ? blocks.join('\n\n') : null
}

// ---- Phase ----

export async function updateSessionPhase(sessionId: string, phase: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('sessions')
    .update({ phase, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) console.error('Error updating phase:', error)
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('sessions')
    .update({ title })
    .eq('id', sessionId)

  if (error) console.error('Error updating title:', error)
}

// ---- Delete ----

export async function deleteMessagesAfter(sessionId: string, messageCreatedAt: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('session_id', sessionId)
    .gt('created_at', messageCreatedAt)

  if (error) console.error('Error deleting messages:', error)
}
