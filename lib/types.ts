// Onboarding
export type OnboardingData = {
  ziel: string
  ki_erfahrung: string
  wer_setzt_um: string
  hindernis: string
  branche: string
  tempo: string
  unternehmensgroesse: string
  intro_message?: string
  memory?: string
}

// Chat
export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export type SessionSummary = {
  id: string
  title: string | null
  phase: string | null
  project_id: string | null
  created_at: string
}

export type Project = {
  id: string
  user_id: string
  name: string
  created_at: string
}

// Canvas
export type PainPoint = {
  id: string
  title: string
  description: string
  frequency?: string
  effort?: string
  priority: 'hoch' | 'mittel' | 'niedrig'
  details?: { [key: string]: string }
}

export type UseCase = {
  id: string
  title: string
  linked_pain_point: string
  effort: string
  impact: string
}

export type CanvasDocument = {
  id: string
  title: string
  content: string
}

export type CanvasData = {
  pain_points: PainPoint[]
  use_cases: UseCase[]
  documents: CanvasDocument[]
  phase: 'diagnose' | 'analyse' | 'plan'
}

// Session
export type Session = {
  id: string
  onboarding: OnboardingData
  canvas: CanvasData
  messages: Message[]
}
