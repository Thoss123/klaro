// Onboarding
export type OnboardingData = {
  ziel: string
  ki_erfahrung: string
  wer_setzt_um: string
  hindernis: string
  branche: string
  tempo: string
  unternehmensgroesse: string
  technik_level?: string
  /** Preferred first name for chat (Anrede) */
  vorname?: string
  /** @deprecated use vorname */
  username?: string
  firmenname?: string
  rolle_im_unternehmen?: string
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
export type Phase = 'diagnose' | 'analyse' | 'plan' | 'umsetzung'

export type PainPoint = {
  id: string
  title: string
  description: string
  frequency?: string
  effort?: string
  priority: 'hoch' | 'mittel' | 'niedrig'
  rank?: number // priority order, 1 = highest
  details?: { [key: string]: string }
}

export type UseCase = {
  id: string
  title: string
  linked_pain_point: string
  effort: string
  impact: string
  // Phase 2/3 enrichment
  setup_effort?: string
  cost_monthly?: string
  tool?: string
  roi?: string
  priority?: 'quick_win' | 'medium_term' | 'long_term' | 'not_recommended'
  /** Phase 3 hint: minimal = current tools only, balanced = light add-on, bold = rethink */
  automation_level?: 'minimal' | 'balanced' | 'bold'
  /** Parsed Ist-Tools list (Phase 2 status quo) */
  tools?: string[]
}

// Functional workflow (Phase 2) — steps with arrows, no tech yet
export type WorkflowStep = {
  id: string
  label: string
  type?: 'trigger' | 'action' | 'ai' | 'decision' | 'human' | 'output'
  tool?: string // filled in Phase 3
  /** Resolved n8n node type, e.g. n8n-nodes-base.gmail */
  n8nType?: string
  n8nTypeVersion?: number
  /** n8n-native parameters from nodes.json */
  parameters?: Record<string, unknown>
  credentialType?: string
  /** Canvas position (React Flow) */
  position?: { x: number; y: number }
  /** Node im Workflow deaktiviert (n8n: disabled — wird übersprungen). */
  disabled?: boolean
  /** Deutsche Klartext-Beschreibung was dieser Schritt IM Workflow tut (statt generischer n8n-Doku). */
  note?: string
  /** AI sub-connections (ai_languageModel/ai_memory/ai_tool) — Slot id → angehängte Sub-Node step-ids. */
  aiSubNodes?: Record<string, string[]>
  /** Markiert eine Sub-Node (Chat Model/Memory/Tool), die an einen Agent/Chain hängt. */
  subNodeOf?: { parentId: string; slot: string }
}

/** Edge between workflow steps — IF, Switch outputs, Merge inputs */
export type WorkflowEdge = {
  id: string
  source: string
  target: string
  /** Source output: default | true | false | switch-0 … switch-N */
  branch?: 'default' | 'true' | 'false' | string
  /** Target input index (Merge node) */
  targetInput?: number
  /** AI sub-connection (ai_languageModel/ai_memory/ai_tool) — sonst Main-Connection. */
  connectionType?: string
}

export type Workflow = {
  id: string
  title: string
  linked_pain_point: string
  steps: WorkflowStep[]
  edges?: WorkflowEdge[]
}

export type CanvasDocument = {
  id: string
  title: string
  content: string
  format?: 'markdown' | 'text'
  /** Canvas zone where this doc is shown (inferred from title if missing) */
  phase?: Phase
}

/** Ein dynamischer Platzhalter in einer Dokument-Vorlage (z.B. {{kunde_name}}). */
export type TemplatePlaceholder = {
  /** Schlüssel ohne Klammern, snake_case — z.B. kunde_name */
  key: string
  /** Anzeige-Label für den Nutzer — z.B. "Kundenname" */
  label: string
  /** Optionale Erklärung, woher der Wert kommt / was reinkommt */
  description?: string
  /** Beispielwert zur Veranschaulichung */
  example?: string
}

/**
 * Eine Dokument-/Nachrichten-Vorlage, die ein Workflow verbraucht oder erzeugt
 * (Angebot, Vertrag, E-Mail, WhatsApp, Report, KI-Prompt). Konkrete Werte sind
 * durch {{platzhalter}} ersetzt, die zur Laufzeit von KI/Daten gefüllt werden.
 */
export type DocumentTemplate = {
  id: string                          // tmpl_1
  title: string                       // "Angebot — Vorlage"
  /** id des Workflows (workflow_plans/workflows), zu dem die Vorlage gehört */
  linked_workflow?: string
  /** verbraucht der Workflow das Dokument (input) oder erzeugt er es (output)? */
  role: 'input' | 'output'
  /** echtes Datei-Template + Platzhalter-Ersatz vs. KI erzeugt Text je Lauf */
  delivery: 'document' | 'text'
  target_format?: 'google_docs' | 'google_sheets' | 'text' | 'email' | 'whatsapp'
  /** Vorlage aus Nutzer-Upload templatisiert oder von Axantilo neu entworfen */
  source: 'user_upload' | 'axantilo_generated'
  /** Original-Upload (chat-uploads Bucket) */
  source_file_url?: string
  source_format?: 'pdf' | 'text'
  /** Vorlagentext mit {{platzhaltern}} (markdown/text) */
  content: string
  placeholders: TemplatePlaceholder[]
  /**
   * Vollständig ausgefülltes Beispiel (aus dem Muster-Dokument abgeleitet), bei dem
   * personenbezogene/private Daten durch realistische Fake-Werte ersetzt sind. Dient
   * der Laufzeit-KI als Few-Shot-Beispiel für Stil & Format — landet in deren System-Prompt.
   */
  example_filled?: string
}

/** Unternehmensprofil aus Phase 1 (Angebot, Akquise, Ablauf) */
export type CompanyProfile = {
  offer?: string
  target_customers?: string
  acquisition?: string
  process_steps?: string[]
  /** Phase 2: minimal | balanced | bold */
  change_appetite?: string
  notes?: string
}

/** Datenquelle aus Phase 2 — eigene Lösung oder Axantilo-Auto-Provisioning */
export type DataLayer = {
  source_type: 'supabase' | 'custom' | 'none' | string
  source_name?: string   // z.B. "HubSpot CRM", "Google Sheets"
  auto_provisioned?: boolean
  notes?: string
}

export type CanvasData = {
  pain_points: PainPoint[]
  use_cases: UseCase[]
  workflows: Workflow[]
  /** Phase-3 sketches; in Phase 4 deploy list starts empty until build_workflow. */
  workflow_plans?: Workflow[]
  documents: CanvasDocument[]
  company?: CompanyProfile
  phase: Phase
  /** Neu: User configuration for workflow steps before deployment */
  workflow_step_configs?: WorkflowStepConfigs
  /** Phase-2: Datenquelle des Nutzers (eigene DB/CRM oder Axantilo auto-provisioned) */
  data_layer?: DataLayer
  /** Phase-3/4: Dokument-/Nachrichten-Vorlagen je Workflow (Angebote, Mails, …) */
  document_templates?: DocumentTemplate[]
}

// Session
export type Session = {
  id: string
  onboarding: OnboardingData
  canvas: CanvasData
  messages: Message[]
}

// Phase 4 — deployed workflows & credentials
export type DeployedWorkflow = {
  id: string
  project_id: string
  linked_use_case: string | null
  n8n_workflow_id: string | null
  name: string
  description?: string
  status: 'active' | 'inactive' | 'error' | 'draft'
  execution_count: number
  last_execution_at?: string
  created_at: string
}

export type Credential = {
  id: string
  tool_name: string
  credential_type: 'api_key' | 'oauth'
  status: 'active' | 'revoked' | 'expired'
  n8n_credential_id?: string
  // encrypted_value never sent to frontend
  created_at: string
}

// Phase 4 extensions to WorkflowStep
export type WorkflowStepMapped = WorkflowStep & {
  node_type?: string         // n8n node type, e.g. "n8n-nodes-base.gmail"
  credential_tool?: string   // which credential is needed, e.g. "gmail"
}

// Phase 4 — interactive deployment: per-step user configuration (n8n-native)
export type StepConfigType = 'credential' | 'ai' | 'human' | 'schedule' | 'webhook' | 'n8n'

export interface StepConfig {
  configType: StepConfigType
  /** n8n node type from catalog */
  n8nType?: string
  n8nTypeVersion?: number
  /** n8n-native parameters */
  parameters?: Record<string, unknown>
  credentialType?: string
  credentialValue?: string
  // legacy — kept for migration
  provider?: string
  systemPrompt?: string
  userPrompt?: string
  model?: string
  temperature?: number
  maxTokens?: number
  channel?: 'email' | 'whatsapp' | 'telegram'
  address?: string
  messageTemplate?: string
  cronExpression?: string
  timezone?: string
  httpMethod?: string
  httpUrl?: string
}

/** workflowId → stepId → StepConfig */
export type WorkflowStepConfigs = Record<string, Record<string, StepConfig>>

// Agent-style action feedback
export interface AgentAction {
  id: string
  type: 'canvas_update' | 'phase_summary' | 'phase_prepare' | 'memory_save' | 'memory_update' | 'request_credential' | 'deploy_workflow' | 'test_workflow' | 'research_solutions' | 'create_workflow_plan' | 'build_workflow' | 'edit_workflow' | 'create_document_template'
  status: 'running' | 'done' | 'error'
  label: string
  detail?: string
  timestamp?: number
}
