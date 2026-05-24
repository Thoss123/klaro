import { createSupabaseBrowserClient } from './supabase-browser'
import { Message, CanvasData, OnboardingData, Project } from './types'

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
      phase: phase,
      memory: memory || null,
      title: null,
      user_id: userId,
      welcome_sent: false
    })
    .select('id')
    .single()

  if (error) throw error
  
  // Create canvas for this session
  const canvasPayload = initialCanvas 
    ? { ...initialCanvas, phase: phase }
    : { pain_points: [], use_cases: [], documents: [], phase: phase };

  await supabase.from('canvas').insert({
    session_id: data.id,
    data: canvasPayload
  })

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
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw error
  }
  return data?.data as CanvasData | null
}

export async function loadSessionOnboarding(sessionId: string): Promise<OnboardingData | null> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('ziel, ki_erfahrung, wer_setzt_um, hindernis, branche, tempo, unternehmensgroesse, memory')
    .eq('id', sessionId)
    .single()

  if (error) {
    console.error('Error loading onboarding:', error)
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

  if (error) console.error('Error updating welcome_sent:', error)
}

export async function isWelcomeSent(sessionId: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('welcome_sent')
    .eq('id', sessionId)
    .single()
    
  if (error) return false
  return data?.welcome_sent || false
}

// ---- Messages ----

export async function saveMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role, content })

  if (error) console.error('Error saving message:', error)

  // Update session timestamp
  await supabase
    .from('sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)
}

// ---- Canvas ----

export async function saveCanvas(sessionId: string, canvasData: CanvasData): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase
    .from('canvas')
    .upsert({ session_id: sessionId, data: canvasData, updated_at: new Date().toISOString() }, { onConflict: 'session_id' })

  if (error) console.error('Error saving canvas:', error)
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
