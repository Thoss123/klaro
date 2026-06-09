import React, { useEffect, useRef, useState } from 'react';
import { CanvasData, CanvasDocument, PainPoint, UseCase, Workflow } from '@/lib/types';
import { inferDocumentPhase, isValidWorkflow, normalizeCompanyProfile, parseToolList, toDisplayText } from '@/lib/canvas-normalize';
import { getBuiltWorkflows, getWorkflowPlans } from '@/lib/workflow-plans';
import { Check, Lock, FileText, Target, AlertTriangle, ArrowRight, Cpu, Zap, GitBranch, Send, Wrench, User, Download, X, Clock, Euro, Building2, Rocket } from 'lucide-react';
import type { StepConfig, WorkflowStepConfigs } from '@/lib/types';
import type { WorkflowEditorCoachContext } from '@/lib/workflow-editor-context';
import WorkflowDeployCard from './WorkflowDeployCard';
import WorkflowNodeGraph from './WorkflowNodeGraph';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

const PHASE_ORDER = ['diagnose', 'analyse', 'plan', 'umsetzung'];
const PHASE_NAMES: Record<string, string> = {
  diagnose:  'PHASE 1: DIAGNOSE',
  analyse:   'PHASE 2: TOOLS & SETUP',
  plan:      'PHASE 3: WORKFLOWS',
  umsetzung: 'PHASE 4: UMSETZUNG',
};

// Node definitions — 4 phases on a tall vertical canvas (DO NOT change layout/curve/side cards)
const NODES = {
  diagnose:  { top: '90%', left: '40%', boxSide: 'right' as const, svgY: 90, svgX: 40 },
  analyse:   { top: '65%', left: '45%', boxSide: 'left'  as const, svgY: 65, svgX: 45 },
  plan:      { top: '40%', left: '40%', boxSide: 'right' as const, svgY: 40, svgX: 40 },
  umsetzung: { top: '13%', left: '45%', boxSide: 'left'  as const, svgY: 13, svgX: 45 },
};

/** Hide redundant blobs when a phase document already covers the same topic */
function docTitleMatches(doc: CanvasDocument, re: RegExp) {
  return re.test(cleanTitle(doc.title).toLowerCase());
}

function phaseDocsCover(
  docs: CanvasDocument[],
  patterns: RegExp[]
): boolean {
  return docs.length > 0 && patterns.some(p => docs.some(d => docTitleMatches(d, p)));
}

/** Same % anchor as phase checkpoint (vertical center on large canvas) */
function railTop(phase: keyof typeof NODES): string {
  return NODES[phase].top;
}

const numMap: Record<string, string> = { diagnose: '1', analyse: '2', plan: '3', umsetzung: '4' };

const STEP_ICONS: Record<string, React.ReactNode> = {
  trigger:  <Zap size={13} />,
  action:   <ArrowRight size={13} />,
  ai:       <Cpu size={13} />,
  decision: <GitBranch size={13} />,
  output:   <Send size={13} />,
};

// Strip raw IDs like "(pp_1)" from display titles
const cleanTitle = (s: unknown) =>
  toDisplayText(s).replace(/\s*\([a-z]+_\d+\)/gi, '').trim();

const changeAppetiteLabel = (level: string) => {
  const m: Record<string, string> = {
    minimal: 'A — möglichst wenig ändern',
    balanced: 'B — offen für sinnvolle Zusatz-Tools',
    bold: 'C — Prozesse neu denken',
  };
  return m[level] || level;
};

// Staggered card entrance animation
const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.07, duration: 0.25, ease: 'easeOut' }
  }),
};

export default function RoadmapCanvas({
  data,
  currentPhase,
  maxReachedPhase,
  onPhaseClick,
  // Phase 4 deploy card props (optional — only used when phase=umsetzung)
  projectId,
  workflowStepConfigs,
  onStepConfigSave,
  deployedWorkflowIds,
  onWorkflowDeployed,
  openDeployWorkflowId,
  onDeployModalOpened,
  onWorkflowPersist,
  editorCoachContext,
}: {
  data: CanvasData
  currentPhase: string
  /** Highest phase ever reached in this project (keeps later phases unlocked) */
  maxReachedPhase?: string
  onPhaseClick: (phase: string) => void
  /** Phase 4 interactive deploy */
  projectId?: string
  workflowStepConfigs?: WorkflowStepConfigs
  onStepConfigSave?: (workflowId: string, stepId: string, config: StepConfig) => void
  deployedWorkflowIds?: Record<string, string>
  onWorkflowDeployed?: (workflowId: string, dbId: string) => void
  /** Auto-open editor modal for this workflow id (after build_workflow). */
  openDeployWorkflowId?: string | null
  onDeployModalOpened?: (workflowId: string) => void
  onWorkflowPersist?: (workflow: Workflow) => void
  /** Gleicher Coach-Kontext wie Haupt-Chat für Workflow-Editor. */
  editorCoachContext?: WorkflowEditorCoachContext
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openDoc, setOpenDoc] = useState<CanvasDocument | null>(null);
  const [openWorkflow, setOpenWorkflow] = useState<Workflow | null>(null);
  const [openUseCase, setOpenUseCase] = useState<UseCase | null>(null);
  const [openPainPoint, setOpenPainPoint] = useState<PainPoint | null>(null);
  const [showCompany, setShowCompany] = useState(false);
  const [showImplementer, setShowImplementer] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      const activeNode = NODES[currentPhase as keyof typeof NODES] || NODES.diagnose;
      const container = containerRef.current;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const targetTop = Math.max(0, (parseFloat(activeNode.top) / 100) * scrollHeight - clientHeight / 2);
      const startTop = container.scrollTop;
      const distance = targetTop - startTop;
      const duration = 2000;
      let startTime: number | null = null;
      const animation = (currentTime: number) => {
        if (startTime === null) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
        container.scrollTop = startTop + distance * ease;
        if (elapsed < duration) requestAnimationFrame(animation);
      };
      requestAnimationFrame(animation);
    }
  }, [currentPhase]);

  const progressPhase = maxReachedPhase || data.phase || 'diagnose';
  const maxReachedIdx = Math.max(
    0,
    PHASE_ORDER.indexOf(progressPhase as (typeof PHASE_ORDER)[number])
  );
  const isAccessible = (phase: string) => PHASE_ORDER.indexOf(phase) <= maxReachedIdx;

  const painPoints = data.pain_points || [];
  const useCases   = data.use_cases   || [];
  const planWorkflows = getWorkflowPlans(data).filter(isValidWorkflow);
  const builtWorkflows = getBuiltWorkflows(data).filter(isValidWorkflow);
  const documents  = data.documents   || [];
  const docsByPhase = (phase: string) =>
    documents.filter(d => inferDocumentPhase(d) === phase);
  const company    = normalizeCompanyProfile(data.company) ?? data.company;
  const hasCompany = !!(
    company?.offer ||
    company?.target_customers ||
    company?.acquisition ||
    company?.process_steps?.length ||
    company?.notes
  );

  const sortedPainPoints = [...painPoints].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  const diagDocs = docsByPhase('diagnose');
  const analyseDocs = docsByPhase('analyse');
  const planDocs = docsByPhase('plan');
  const umsetzungDocs = docsByPhase('umsetzung');

  const showCompanyCard =
    hasCompany && !phaseDocsCover(diagDocs, [/unternehmen/, /profil/, /zusammenfassung/]);
  const showPainCards =
    sortedPainPoints.length > 0 &&
    !phaseDocsCover(diagDocs, [/pain/, /engpass/, /problem/, /herausforderung/]);
  const showUseCases =
    useCases.length > 0 &&
    !phaseDocsCover(analyseDocs, [/tool/, /prozess/, /ist-/, /setup/, /marketing/, /automatisierung/]);
  const showImplementerCard =
    !!data.implementer &&
    !phaseDocsCover(analyseDocs, [/umsetzer/, /implementier/, /skill/]);

  const twoColGrid = 'grid grid-cols-1 min-[300px]:grid-cols-2 gap-3 min-w-0';

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden relative bg-transparent @container" ref={containerRef} style={{ scrollBehavior: 'smooth' }}>
      {/* Desktop / tablet: curved roadmap with absolute-positioned nodes + side rails */}
      <div className="hidden @[640px]:block w-full relative min-h-[420vh]">

        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path
            d={`M ${NODES.diagnose.svgX} ${NODES.diagnose.svgY} C 35 80, 50 78, ${NODES.analyse.svgX} ${NODES.analyse.svgY} C 40 55, 35 52, ${NODES.plan.svgX} ${NODES.plan.svgY} C 35 30, 50 28, ${NODES.umsetzung.svgX} ${NODES.umsetzung.svgY}`}
            fill="none" stroke="#e2e8f0" strokeWidth="0.3" strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke"
          />
          <ActivePath d={`M ${NODES.diagnose.svgX} ${NODES.diagnose.svgY} C 35 80, 50 78, ${NODES.analyse.svgX} ${NODES.analyse.svgY}`} active={maxReachedIdx >= 1} />
          <ActivePath d={`M ${NODES.analyse.svgX} ${NODES.analyse.svgY} C 40 55, 35 52, ${NODES.plan.svgX} ${NODES.plan.svgY}`} active={maxReachedIdx >= 2} />
          <ActivePath d={`M ${NODES.plan.svgX} ${NODES.plan.svgY} C 35 30, 50 28, ${NODES.umsetzung.svgX} ${NODES.umsetzung.svgY}`} active={maxReachedIdx >= 3} />
        </svg>

        <PhaseNode phase="diagnose" title="Problem Identifikation" desc="Pain Points & Unternehmensprofil." nodeConfig={NODES.diagnose} isAccessible={isAccessible('diagnose')} isActive={currentPhase === 'diagnose'} isCompleted={maxReachedIdx > 0} onClick={() => onPhaseClick('diagnose')} />
        <PhaseNode phase="analyse" title="Tools & Setup" desc="Ist-Tools & Umsetzer." nodeConfig={NODES.analyse} isAccessible={isAccessible('analyse')} isActive={currentPhase === 'analyse'} isCompleted={maxReachedIdx > 1} onClick={() => onPhaseClick('analyse')} />
        <PhaseNode phase="plan" title="Workflows" desc="Automatisierungs-Blaupausen." nodeConfig={NODES.plan} isAccessible={isAccessible('plan')} isActive={currentPhase === 'plan'} isCompleted={maxReachedIdx > 2} onClick={() => onPhaseClick('plan')} />
        <PhaseNode phase="umsetzung" title="Umsetzung" desc="Deployment & Go-Live." nodeConfig={NODES.umsetzung} isAccessible={isAccessible('umsetzung')} isActive={currentPhase === 'umsetzung'} isCompleted={maxReachedIdx > 3} onClick={() => onPhaseClick('umsetzung')} />

        {/* Phase 1 — links (Checkpoint + Titel rechts) */}
        {(diagDocs.length > 0 || showPainCards) && (
          <ContentRail side="left" top={railTop('diagnose')}>
            {diagDocs.length > 0 && (
              <>
                <SectionLabel>Dokumente</SectionLabel>
                <DocStack docs={diagDocs} onOpen={setOpenDoc} />
              </>
            )}
            {showPainCards && (
              <>
                <SectionLabel className={diagDocs.length > 0 ? 'mt-5' : ''}>Pain Points</SectionLabel>
                <div className={twoColGrid}>
                  {sortedPainPoints.map(p => (
                    <PainPointInlineCard key={p.id} painPoint={p} onExpand={() => setOpenPainPoint(p)} />
                  ))}
                </div>
              </>
            )}
          </ContentRail>
        )}
        {showCompanyCard && company && (
          <ContentRail side="right" top={railTop('diagnose')}>
            <SectionLabel>Unternehmen</SectionLabel>
            <CompanyInlineCard company={company} onExpand={() => setShowCompany(true)} />
          </ContentRail>
        )}

        {/* Phase 2 — rechts */}
        {(analyseDocs.length > 0 || showImplementerCard || showUseCases) && (
          <ContentRail side="right" top={railTop('analyse')}>
            {analyseDocs.length > 0 && (
              <>
                <SectionLabel>Dokumente</SectionLabel>
                <DocStack docs={analyseDocs} onOpen={setOpenDoc} />
              </>
            )}
            {showImplementerCard && (
              <>
                <SectionLabel className={analyseDocs.length > 0 ? 'mt-5' : ''}>Umsetzer</SectionLabel>
                <ImplementerInlineCard
                  implementer={data.implementer}
                  changeAppetite={company?.change_appetite}
                  onExpand={() => setShowImplementer(true)}
                />
              </>
            )}
            {showUseCases && (
              <>
                <SectionLabel className={(analyseDocs.length > 0 || showImplementerCard) ? 'mt-5' : ''}>Ist-Tools & Automatisierung</SectionLabel>
                <div className={twoColGrid}>
                  {useCases.map(uc => (
                    <UseCaseInlineCard key={uc.id} useCase={uc} onExpand={() => setOpenUseCase(uc)} />
                  ))}
                </div>
              </>
            )}
          </ContentRail>
        )}

        {/* Phase 3 — links */}
        {((planWorkflows.length > 0 && maxReachedIdx >= 2) || planDocs.length > 0) && (
          <ContentRail side="left" top={railTop('plan')}>
            {planWorkflows.length > 0 && maxReachedIdx >= 2 && (
              <>
                <SectionLabel>Workflows</SectionLabel>
                <div className={twoColGrid}>
                  {planWorkflows.map(wf => {
                    const linkedPP = painPoints.find(p => p.id === wf.linked_pain_point);
                    return (
                      <WorkflowInlineCard
                        key={wf.id}
                        workflow={wf}
                        linkedTitle={linkedPP ? cleanTitle(linkedPP.title) : undefined}
                        onExpand={() => setOpenWorkflow(wf)}
                      />
                    );
                  })}
                </div>
              </>
            )}
            {planDocs.length > 0 && (
              <>
                <SectionLabel className={planWorkflows.length > 0 && maxReachedIdx >= 2 ? 'mt-5' : ''}>Dokumente</SectionLabel>
                <DocStack docs={planDocs} onOpen={setOpenDoc} />
              </>
            )}
          </ContentRail>
        )}

        {/* Phase 4 — Umsetzung: alle Deploy-Karten in der Phase-4-Rail */}
        {(umsetzungDocs.length > 0 || (builtWorkflows.length > 0 && maxReachedIdx >= 3 && projectId)) && (
          <ContentRail side="right" top={railTop('umsetzung')} className="!w-[min(52%,400px)]">
            {builtWorkflows.length > 0 && maxReachedIdx >= 3 && projectId && (
              <>
                <SectionLabel>Deployment</SectionLabel>
                <div className="grid grid-cols-1 gap-4 min-w-0">
                  {builtWorkflows.map(wf => {
                    const linkedPP = painPoints.find(p => p.id === wf.linked_pain_point);
                    return (
                      <WorkflowDeployCard
                        key={wf.id}
                        workflow={wf}
                        projectId={projectId}
                        compact
                        autoOpen={openDeployWorkflowId === wf.id}
                        onAutoOpen={() => onDeployModalOpened?.(wf.id)}
                        linkedTitle={linkedPP ? cleanTitle(linkedPP.title) : undefined}
                        stepConfigs={workflowStepConfigs?.[wf.id] ?? {}}
                        onStepConfigSave={(stepId, config) => onStepConfigSave?.(wf.id, stepId, config)}
                        deployedWorkflowId={deployedWorkflowIds?.[wf.id]}
                        onDeployed={(dbId) => onWorkflowDeployed?.(wf.id, dbId)}
                        onWorkflowPersist={onWorkflowPersist}
                        editorCoachContext={editorCoachContext}
                      />
                    );
                  })}
                </div>
              </>
            )}
            {umsetzungDocs.length > 0 && (
              <>
                <SectionLabel className={builtWorkflows.length > 0 && maxReachedIdx >= 3 && projectId ? 'mt-5' : ''}>Dokumente</SectionLabel>
                <DocStack docs={umsetzungDocs} onOpen={setOpenDoc} />
              </>
            )}
          </ContentRail>
        )}

      </div>

      {/* Mobile: single-column vertical stack — each phase with its cards full-width */}
      <div className="@[640px]:hidden flex flex-col gap-7 px-4 py-3 pb-8">
        {/* Phase 1 — Diagnose */}
        <section>
          <MobilePhaseHeader phase="diagnose" title="Problem Identifikation" isAccessible={isAccessible('diagnose')} isActive={currentPhase === 'diagnose'} isCompleted={maxReachedIdx > 0} onClick={() => onPhaseClick('diagnose')} />
          {diagDocs.length > 0 && (
            <>
              <SectionLabel className="mb-2">Dokumente</SectionLabel>
              <DocStack docs={diagDocs} onOpen={setOpenDoc} />
            </>
          )}
          {showPainCards && (
            <>
              <SectionLabel className={diagDocs.length > 0 ? 'mt-4 mb-2' : 'mb-2'}>Pain Points</SectionLabel>
              <div className="grid grid-cols-1 gap-3">
                {sortedPainPoints.map(p => (
                  <PainPointInlineCard key={p.id} painPoint={p} onExpand={() => setOpenPainPoint(p)} />
                ))}
              </div>
            </>
          )}
          {showCompanyCard && company && (
            <>
              <SectionLabel className="mt-4 mb-2">Unternehmen</SectionLabel>
              <CompanyInlineCard company={company} onExpand={() => setShowCompany(true)} />
            </>
          )}
        </section>

        {/* Phase 2 — Tools & Setup */}
        <section>
          <MobilePhaseHeader phase="analyse" title="Tools & Setup" isAccessible={isAccessible('analyse')} isActive={currentPhase === 'analyse'} isCompleted={maxReachedIdx > 1} onClick={() => onPhaseClick('analyse')} />
          {analyseDocs.length > 0 && (
            <>
              <SectionLabel className="mb-2">Dokumente</SectionLabel>
              <DocStack docs={analyseDocs} onOpen={setOpenDoc} />
            </>
          )}
          {showImplementerCard && (
            <>
              <SectionLabel className={analyseDocs.length > 0 ? 'mt-4 mb-2' : 'mb-2'}>Umsetzer</SectionLabel>
              <ImplementerInlineCard implementer={data.implementer} changeAppetite={company?.change_appetite} onExpand={() => setShowImplementer(true)} />
            </>
          )}
          {showUseCases && (
            <>
              <SectionLabel className={(analyseDocs.length > 0 || showImplementerCard) ? 'mt-4 mb-2' : 'mb-2'}>Ist-Tools & Automatisierung</SectionLabel>
              <div className="grid grid-cols-1 gap-3">
                {useCases.map(uc => (
                  <UseCaseInlineCard key={uc.id} useCase={uc} onExpand={() => setOpenUseCase(uc)} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Phase 3 — Workflows */}
        <section>
          <MobilePhaseHeader phase="plan" title="Workflows" isAccessible={isAccessible('plan')} isActive={currentPhase === 'plan'} isCompleted={maxReachedIdx > 2} onClick={() => onPhaseClick('plan')} />
          {planWorkflows.length > 0 && maxReachedIdx >= 2 && (
            <>
              <SectionLabel className="mb-2">Workflows</SectionLabel>
              <div className="grid grid-cols-1 gap-3">
                {planWorkflows.map(wf => {
                  const linkedPP = painPoints.find(p => p.id === wf.linked_pain_point);
                  return (
                    <WorkflowInlineCard key={wf.id} workflow={wf} linkedTitle={linkedPP ? cleanTitle(linkedPP.title) : undefined} onExpand={() => setOpenWorkflow(wf)} />
                  );
                })}
              </div>
            </>
          )}
          {planDocs.length > 0 && (
            <>
              <SectionLabel className={planWorkflows.length > 0 && maxReachedIdx >= 2 ? 'mt-4 mb-2' : 'mb-2'}>Dokumente</SectionLabel>
              <DocStack docs={planDocs} onOpen={setOpenDoc} />
            </>
          )}
        </section>

        {/* Phase 4 — Umsetzung */}
        <section>
          <MobilePhaseHeader phase="umsetzung" title="Umsetzung" isAccessible={isAccessible('umsetzung')} isActive={currentPhase === 'umsetzung'} isCompleted={maxReachedIdx > 3} onClick={() => onPhaseClick('umsetzung')} />
          {builtWorkflows.length > 0 && maxReachedIdx >= 3 && projectId && (
            <>
              <SectionLabel className="mb-2">Deployment</SectionLabel>
              <div className="space-y-3">
                {builtWorkflows.map(wf => {
                  const linkedPP = painPoints.find(p => p.id === wf.linked_pain_point);
                  return (
                    <WorkflowDeployCard
                      key={wf.id}
                      workflow={wf}
                      projectId={projectId}
                      autoOpen={openDeployWorkflowId === wf.id}
                      onAutoOpen={() => onDeployModalOpened?.(wf.id)}
                      linkedTitle={linkedPP ? cleanTitle(linkedPP.title) : undefined}
                      stepConfigs={workflowStepConfigs?.[wf.id] ?? {}}
                      onStepConfigSave={(stepId, config) => onStepConfigSave?.(wf.id, stepId, config)}
                      deployedWorkflowId={deployedWorkflowIds?.[wf.id]}
                      onDeployed={(dbId) => onWorkflowDeployed?.(wf.id, dbId)}
                      onWorkflowPersist={onWorkflowPersist}
                      editorCoachContext={editorCoachContext}
                    />
                  );
                })}
              </div>
            </>
          )}
          {umsetzungDocs.length > 0 && (
            <>
              <SectionLabel className={builtWorkflows.length > 0 && maxReachedIdx >= 3 && projectId ? 'mt-4 mb-2' : 'mb-2'}>Dokumente</SectionLabel>
              <DocStack docs={umsetzungDocs} onOpen={setOpenDoc} />
            </>
          )}
        </section>
      </div>

      <DocumentModal doc={openDoc} onClose={() => setOpenDoc(null)} />
      <WorkflowModal workflow={openWorkflow} painPoints={painPoints} onClose={() => setOpenWorkflow(null)} />
      <UseCaseModal useCase={openUseCase} onClose={() => setOpenUseCase(null)} />
      <PainPointModal painPoint={openPainPoint} onClose={() => setOpenPainPoint(null)} />
      <CompanyModal company={company} open={showCompany} onClose={() => setShowCompany(false)} />
      <ImplementerModal implementer={data.implementer} changeAppetite={company?.change_appetite} open={showImplementer} onClose={() => setShowImplementer(false)} />
    </div>
  );
}

// ── Subcomponents ──

function ActivePath({ d, active }: { d: string, active: boolean }) {
  return (
    <motion.path
      d={d} fill="none" stroke="#6366f1" strokeWidth="0.4" strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke"
      initial={{ pathLength: 0 }}
      animate={{
        pathLength: active ? 1 : 0,
        filter: active ? 'drop-shadow(0px 0px 4px rgba(99,102,241,0.8))' : 'drop-shadow(0px 0px 0px rgba(99,102,241,0))',
        strokeWidth: active ? 0.6 : 0.4,
      }}
      transition={{ pathLength: { duration: 1.5, ease: 'easeInOut' }, filter: { delay: 1.5, duration: 1 } }}
    />
  );
}

const CARD_TONE = {
  indigo: 'border-indigo-100 bg-white',
  violet: 'border-violet-100 bg-white',
  rose: 'border-rose-100 bg-white',
  amber: 'border-amber-100 bg-white',
  neutral: 'border-gray-200 bg-white',
} as const;

const PREVIEW_CHARS = 120;
const PREVIEW_BULLETS = 3;

function isShortText(text: string, max = PREVIEW_CHARS) {
  return text.trim().length <= max;
}

/** Content away from center path — may overlap line (ok) */
function ContentRail({
  side,
  top,
  children,
  className = '',
}: {
  side: 'left' | 'right';
  top: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`absolute z-10 flex flex-col gap-3 pointer-events-auto
        -translate-y-1/2 @max-[1200px]:translate-y-0 @max-[1200px]:mt-36
        ${side === 'left' ? 'left-[2%]' : 'right-[2%]'}
        w-[min(44%,320px)] ${className}`}
      style={{ top }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-[10px] font-bold uppercase tracking-wider text-slate-400 ${className}`}>
      {children}
    </h3>
  );
}

function ExpandLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 mt-2 text-left"
    >
      … alle Details
    </button>
  );
}

function StructuredCard({
  title,
  icon,
  tone,
  children,
  onExpand,
  expandable,
}: {
  title: string;
  icon: React.ReactNode;
  tone: keyof typeof CARD_TONE;
  children: React.ReactNode;
  onExpand?: () => void;
  expandable?: boolean;
}) {
  const Wrapper = expandable && onExpand ? 'div' : 'div';
  return (
    <Wrapper className={`rounded-lg border p-3.5 shadow-sm text-sm ${CARD_TONE[tone]}`}>
      <div className="flex items-start gap-2.5 mb-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <p className="font-semibold text-gray-900 leading-snug text-sm">{title}</p>
      </div>
      <div className="text-gray-600 text-xs leading-relaxed pl-0.5">{children}</div>
      {expandable && onExpand && <ExpandLink onClick={onExpand} />}
    </Wrapper>
  );
}

function CompanyInlineCard({
  company,
  onExpand,
}: {
  company: NonNullable<CanvasData['company']>;
  onExpand: () => void;
}) {
  const c = normalizeCompanyProfile(company) ?? company;
  const rows: { label: string; value: string }[] = [];
  if (c.offer) rows.push({ label: 'Angebot', value: toDisplayText(c.offer) });
  if (c.target_customers) rows.push({ label: 'Zielkunden', value: toDisplayText(c.target_customers) });
  if (c.acquisition) rows.push({ label: 'Akquise', value: toDisplayText(c.acquisition) });
  const steps = c.process_steps ?? [];
  const allShort =
    rows.every(r => isShortText(r.value, 80)) &&
    (steps.length === 0 || (steps.length <= 4 && steps.every(s => isShortText(s, 50))));
  const expandable = !allShort;

  return (
    <StructuredCard
      title="Unternehmensprofil"
      icon={<Building2 size={15} className="text-indigo-500" />}
      tone="indigo"
      onExpand={expandable ? onExpand : undefined}
      expandable={expandable}
    >
      <dl className="space-y-2">
        {rows.map(r => (
          <div key={r.label}>
            <dt className="text-[10px] font-bold uppercase text-gray-400">{r.label}</dt>
            <dd className={expandable ? 'line-clamp-2' : ''}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {steps.length > 0 && (
        <ol className={`mt-2 space-y-0.5 list-decimal list-inside text-gray-600 ${expandable ? '' : ''}`}>
          {(expandable ? steps.slice(0, PREVIEW_BULLETS) : steps).map((s, i) => (
            <li key={i} className={expandable ? 'line-clamp-1' : ''}>{toDisplayText(s)}</li>
          ))}
          {expandable && steps.length > PREVIEW_BULLETS && (
            <li className="text-gray-400 list-none">… {steps.length - PREVIEW_BULLETS} weitere Schritte</li>
          )}
        </ol>
      )}
    </StructuredCard>
  );
}

function PainPointInlineCard({
  painPoint: p,
  onExpand,
}: {
  painPoint: PainPoint;
  onExpand: () => void;
}) {
  const title = cleanTitle(toDisplayText(p.title));
  const desc = toDisplayText(p.description);
  const expandable = !isShortText(desc, 90);

  return (
    <StructuredCard
      title={title}
      icon={<AlertTriangle size={15} className="text-rose-400" />}
      tone="rose"
      onExpand={expandable ? onExpand : undefined}
      expandable={expandable}
    >
      <p className={expandable ? 'line-clamp-3' : ''}>{desc}</p>
      {(p.frequency || p.effort) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {p.frequency && <Chip icon={<Clock size={10} />}>{toDisplayText(p.frequency)}</Chip>}
          {p.effort && <Chip>{toDisplayText(p.effort)}</Chip>}
        </div>
      )}
    </StructuredCard>
  );
}

function UseCaseInlineCard({ useCase: uc, onExpand }: { useCase: UseCase; onExpand: () => void }) {
  const tools = uc.tools?.length ? uc.tools : parseToolList(uc.tool);
  const title = cleanTitle(uc.title) || 'Use Case';
  const expandable = tools.length > PREVIEW_BULLETS || tools.some(t => t.length > 40);
  const visible = expandable ? tools.slice(0, PREVIEW_BULLETS) : tools;

  return (
    <StructuredCard
      title={title}
      icon={<Target size={15} className="text-indigo-500" />}
      tone="indigo"
      onExpand={expandable ? onExpand : undefined}
      expandable={expandable}
    >
      {tools.length === 0 ? (
        <p className="italic text-gray-400">Noch keine Tools erfasst</p>
      ) : (
        <ul className="space-y-1">
          {visible.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-indigo-400 shrink-0">•</span>
              <span className={expandable ? 'line-clamp-1' : ''}>{t}</span>
            </li>
          ))}
          {expandable && tools.length > PREVIEW_BULLETS && (
            <li className="text-gray-400">… {tools.length - PREVIEW_BULLETS} weitere</li>
          )}
        </ul>
      )}
    </StructuredCard>
  );
}

function ImplementerInlineCard({
  implementer,
  changeAppetite,
  onExpand,
}: {
  implementer?: CanvasData['implementer'];
  changeAppetite?: string;
  onExpand: () => void;
}) {
  if (!implementer) {
    return (
      <StructuredCard title="Umsetzer-Profil" icon={<User size={15} className="text-violet-500" />} tone="violet">
        <p className="italic text-gray-400">Wird am Ende von Phase 2 im Chat geklärt.</p>
      </StructuredCard>
    );
  }
  const lines = [
    `Wer: ${toDisplayText(implementer.who)}`,
    `Skill: ${toDisplayText(implementer.skill_level)}`,
    implementer.automation_experience ? `Erfahrung: ${toDisplayText(implementer.automation_experience)}` : '',
  ].filter(Boolean);
  const expandable = lines.some(l => l.length > 70) || !!changeAppetite;

  return (
    <StructuredCard
      title="Umsetzer-Profil"
      icon={<User size={15} className="text-violet-500" />}
      tone="violet"
      onExpand={expandable ? onExpand : undefined}
      expandable={expandable}
    >
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className={expandable ? 'line-clamp-2' : ''}>{l}</li>
        ))}
      </ul>
      {changeAppetite && (
        <p className="mt-2 pt-2 border-t border-gray-100 text-gray-500">
          {changeAppetiteLabel(changeAppetite)}
        </p>
      )}
    </StructuredCard>
  );
}

function WorkflowInlineCard({
  workflow: wf,
  linkedTitle,
  onExpand,
}: {
  workflow: Workflow;
  linkedTitle?: string;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5 shadow-sm text-sm text-left hover:border-amber-300 hover:shadow-md transition-all w-full"
    >
      <div className="flex items-start gap-2.5 mb-2">
        <GitBranch size={15} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 leading-snug text-sm">{cleanTitle(wf.title)}</p>
          {linkedTitle && <p className="text-[11px] text-gray-400 mt-0.5">↳ {linkedTitle}</p>}
        </div>
      </div>
      <WorkflowNodeGraph steps={wf.steps ?? []} compact showTrailingPlus={false} />
      <span className="text-xs font-medium text-indigo-600 mt-2 inline-block">Workflow öffnen</span>
    </button>
  );
}

function DocStack({
  docs,
  onOpen,
}: {
  docs: CanvasDocument[];
  onOpen: (doc: CanvasDocument) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {docs.map(doc => (
        <DocInlineCard key={doc.id} doc={doc} onOpen={() => onOpen(doc)} />
      ))}
    </div>
  );
}

function DocInlineCard({ doc, onOpen }: { doc: CanvasDocument; onOpen: () => void }) {
  const plain = doc.content.replace(/[#*`_>-]/g, ' ').replace(/\s+/g, ' ').trim();
  const expandable = !isShortText(plain, 100);
  const preview = expandable ? plain.slice(0, 100).trim() + '…' : plain;

  if (!expandable) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm text-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <FileText size={14} className="text-blue-500 shrink-0" />
          <p className="font-semibold text-gray-900">{cleanTitle(doc.title)}</p>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">{preview}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm text-sm text-left hover:border-indigo-300 hover:shadow-md transition-all w-full"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <FileText size={14} className="text-blue-500 shrink-0" />
        <p className="font-semibold text-gray-900">{cleanTitle(doc.title)}</p>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{preview}</p>
      <span className="text-xs font-medium text-indigo-600 mt-2 inline-block">… alle Details</span>
    </button>
  );
}

function Chip({ children, icon }: { children: React.ReactNode, icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 bg-white/70 border border-gray-200 text-[11px] px-2 py-0.5 rounded text-gray-600">
      {icon}{children}
    </span>
  );
}

function WorkflowModal({ workflow, painPoints, onClose }: { workflow: Workflow | null, painPoints: PainPoint[], onClose: () => void }) {
  const linkedPP = workflow ? painPoints.find(p => p.id === workflow.linked_pain_point) : undefined;

  return (
    <AnimatePresence>
      {workflow && (
        <motion.div
          key="workflow-modal-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <GitBranch size={16} className="text-amber-600" />
                  <h2 className="font-bold text-gray-900 text-lg">{cleanTitle(workflow.title)}</h2>
                </div>
                {linkedPP && (
                  <p className="text-sm text-gray-500 pl-6">Löst Pain Point: {cleanTitle(linkedPP.title)}</p>
                )}
              </div>
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors ml-4 flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            <WorkflowNodeGraph steps={workflow.steps} showTrailingPlus />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function UseCaseModal({ useCase, onClose }: { useCase: UseCase | null; onClose: () => void }) {
  if (!useCase) return null;
  const tools = useCase.tools?.length ? useCase.tools : parseToolList(useCase.tool);
  return (
    <DetailShell title={cleanTitle(useCase.title) || 'Use Case'} onClose={onClose}>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Status quo — genutzte Tools</p>
      {tools.length > 0 ? (
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">{tools.map((t, i) => <li key={i}>{t}</li>)}</ul>
      ) : (
        <p className="text-sm text-gray-400 italic">Noch keine Tools erfasst</p>
      )}
    </DetailShell>
  );
}

function PainPointModal({ painPoint, onClose }: { painPoint: PainPoint | null; onClose: () => void }) {
  if (!painPoint) return null;
  return (
    <DetailShell title={cleanTitle(toDisplayText(painPoint.title))} onClose={onClose}>
      <p className="text-sm text-gray-600 leading-relaxed">{toDisplayText(painPoint.description)}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {painPoint.frequency && <Chip icon={<Clock size={10} />}>{toDisplayText(painPoint.frequency)}</Chip>}
        {painPoint.effort && <Chip>{toDisplayText(painPoint.effort)}</Chip>}
        {painPoint.rank != null && <Chip>Priorität #{painPoint.rank}</Chip>}
      </div>
    </DetailShell>
  );
}

function CompanyModal({ company, open, onClose }: { company?: CanvasData['company']; open: boolean; onClose: () => void }) {
  if (!open || !company) return null;
  const c = normalizeCompanyProfile(company) ?? company;
  return (
    <DetailShell title="Unternehmensprofil" onClose={onClose}>
      <dl className="space-y-3 text-sm">
        {c.offer && <div><dt className="text-xs font-bold text-gray-500">Angebot</dt><dd>{toDisplayText(c.offer)}</dd></div>}
        {c.target_customers && <div><dt className="text-xs font-bold text-gray-500">Zielkunden</dt><dd>{toDisplayText(c.target_customers)}</dd></div>}
        {c.acquisition && <div><dt className="text-xs font-bold text-gray-500">Akquise</dt><dd>{toDisplayText(c.acquisition)}</dd></div>}
      </dl>
      {c.process_steps && c.process_steps.length > 0 && (
        <ol className="list-decimal list-inside mt-4 text-sm text-gray-600 space-y-1">
          {c.process_steps.map((s, i) => <li key={i}>{toDisplayText(s)}</li>)}
        </ol>
      )}
    </DetailShell>
  );
}

function ImplementerModal({
  implementer, changeAppetite, open, onClose,
}: {
  implementer?: CanvasData['implementer']; changeAppetite?: string; open: boolean; onClose: () => void;
}) {
  if (!open) return null;
  return (
    <DetailShell title="Umsetzer-Profil" onClose={onClose}>
      {implementer ? (
        <dl className="space-y-3 text-sm">
          <div><dt className="text-xs font-bold text-gray-500">Wer setzt um</dt><dd>{toDisplayText(implementer.who)}</dd></div>
          <div><dt className="text-xs font-bold text-gray-500">Skill-Level</dt><dd className="capitalize">{toDisplayText(implementer.skill_level)}</dd></div>
          {implementer.automation_experience && (
            <div><dt className="text-xs font-bold text-gray-500">Erfahrung</dt><dd>{toDisplayText(implementer.automation_experience)}</dd></div>
          )}
        </dl>
      ) : (
        <p className="text-sm text-gray-400 italic">Noch nicht geklärt — Klaro fragt das am Ende von Phase 2.</p>
      )}
      {changeAppetite && (
        <p className="text-xs text-gray-500 mt-4 pt-3 border-t"><span className="font-semibold">Veränderungsbereitschaft: </span>{changeAppetiteLabel(changeAppetite)}</p>
      )}
    </DetailShell>
  );
}

function DetailShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
        <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-bold text-gray-900">{title}</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function DocumentModal({ doc, onClose }: { doc: CanvasDocument | null, onClose: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = () => {
    if (!doc) return;
    const html = contentRef.current?.innerHTML || '';
    const win = window.open('', '_blank', 'width=800,height=1000');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${doc.title}</title>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, system-ui, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.65; max-width: 720px; margin: 40px auto; padding: 0 24px; }
        h1 { font-size: 26px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        h2 { font-size: 20px; margin-top: 28px; }
        h3 { font-size: 16px; margin-top: 22px; }
        p, li { font-size: 14px; }
        code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; font-size: 13px; }
        pre { background: #f3f4f6; padding: 14px; border-radius: 8px; overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; font-size: 13px; }
        th { background: #f9fafb; }
        blockquote { border-left: 3px solid #818cf8; margin: 12px 0; padding-left: 16px; color: #6b7280; }
        @media print { body { margin: 0; } }
      </style></head><body><h1>${doc.title}</h1>${html}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 350);
  };

  return (
    <AnimatePresence>
      {doc && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600 shrink-0"><FileText size={16} /></span>
                <h2 className="font-bold text-gray-900 truncate">{cleanTitle(doc.title)}</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDownloadPdf}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors"
                >
                  <Download size={14} /> PDF
                </button>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-8 py-6">
              <div ref={contentRef} className="prose prose-sm max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-a:text-indigo-600">
                <ReactMarkdown>{doc.content}</ReactMarkdown>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PhaseCircle({
  phase, isAccessible, isActive, isCompleted, onClick,
}: {
  phase: string; isAccessible: boolean; isActive: boolean; isCompleted: boolean; onClick: () => void;
}) {
  const num = numMap[phase];
  return (
    <div className="relative">
      {!isAccessible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 bg-slate-800 text-white text-xs p-2 rounded-lg text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          Diese Phase wurde noch nicht erreicht.
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
      <motion.button
        onClick={isAccessible ? onClick : undefined}
        layout initial={false}
        animate={{
          backgroundColor: !isAccessible ? '#f1f5f9' : isActive ? '#eef2ff' : '#ffffff',
          borderColor: !isAccessible ? '#e2e8f0' : isActive ? '#818cf8' : '#c7d2fe',
          opacity: !isAccessible ? 0.6 : 1,
        }}
        transition={{ duration: 0.6 }}
        className={`w-28 h-28 rounded-full flex items-center justify-center relative z-10
          ${!isAccessible ? 'cursor-not-allowed border-2' : isActive ? 'border-[3px] shadow-[0_0_0_6px_rgba(99,102,241,0.1)]' : 'border-2 hover:border-indigo-400 hover:shadow-lg cursor-pointer'}`}
      >
        <motion.div animate={{ borderColor: isAccessible ? '#a5b4fc' : '#cbd5e1' }} transition={{ duration: 0.6 }} className="absolute inset-2 rounded-full border border-dashed" />
        <div className="text-3xl font-bold text-slate-700 z-10 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {!isAccessible ? (
              <motion.div key="lock" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                <Lock size={28} className="text-slate-400" />
              </motion.div>
            ) : isCompleted ? (
              <motion.div key="check" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                <Check size={36} className="text-indigo-500" strokeWidth={3} />
              </motion.div>
            ) : (
              <motion.span key="num" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="text-indigo-600">
                {num}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    </div>
  );
}

function PhaseNode({
  phase, title, desc, nodeConfig, isAccessible, isActive, isCompleted, onClick,
}: {
  phase: string, title: string, desc: string, nodeConfig: { top: string; left: string; boxSide: 'left' | 'right'; svgY: number; svgX: number },
  isAccessible: boolean, isActive: boolean, isCompleted: boolean, onClick: () => void,
}) {
  return (
    <div className="absolute group z-20" style={{ top: nodeConfig.top, left: nodeConfig.left, transform: 'translate(-50%, -50%)' }}>
      {/* ≥1536px: horizontal — title beside circle (classic roadmap, enough room so it won't hit the side cards) */}
      <div className="hidden @[1536px]:flex items-center">
        {nodeConfig.boxSide === 'left' && <TitleBox phase={phase} title={title} desc={desc} side="left" isAccessible={isAccessible} />}
        <PhaseCircle phase={phase} isAccessible={isAccessible} isActive={isActive} isCompleted={isCompleted} onClick={onClick} />
        {nodeConfig.boxSide === 'right' && <TitleBox phase={phase} title={title} desc={desc} side="right" isAccessible={isAccessible} />}
      </div>
      {/* <1536px: stacked — title above circle (avoids horizontal collision when space is tight) */}
      <div className="flex @[1536px]:hidden flex-col items-center gap-2">
        <TitleBoxStacked phase={phase} title={title} desc={desc} isAccessible={isAccessible} />
        <PhaseCircle phase={phase} isAccessible={isAccessible} isActive={isActive} isCompleted={isCompleted} onClick={onClick} />
      </div>
    </div>
  );
}

/** Horizontal title beside the circle — used on large screens where there's room. */
function TitleBox({ phase, title, desc, side, isAccessible }: { phase: string; title: string; desc: string; side: 'left' | 'right'; isAccessible: boolean }) {
  return (
    <div className={`flex items-center ${side === 'left' ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
      <motion.div animate={{ backgroundColor: isAccessible ? '#c7d2fe' : '#e2e8f0' }} transition={{ duration: 0.6 }} className="w-8 h-[2px]" />
      <motion.div
        animate={{ borderColor: isAccessible ? '#e0e7ff' : '#e2e8f0', backgroundColor: isAccessible ? 'rgba(238,242,255,0.85)' : '#f8fafc', opacity: isAccessible ? 1 : 0.5 }}
        transition={{ duration: 0.6 }}
        className="w-48 backdrop-blur-sm border p-4 rounded-2xl shadow-sm"
      >
        <motion.div animate={{ color: isAccessible ? '#818cf8' : '#94a3b8' }} transition={{ duration: 0.6 }} className="text-[10px] font-bold uppercase tracking-widest mb-1">
          {PHASE_NAMES[phase]}
        </motion.div>
        <motion.h4 animate={{ color: isAccessible ? '#312e81' : '#475569' }} transition={{ duration: 0.6 }} className="font-bold mb-1 leading-tight">
          {title}
        </motion.h4>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </motion.div>
    </div>
  );
}

/** Compact phase header for the mobile single-column layout. */
function MobilePhaseHeader({
  phase, title, isAccessible, isActive, isCompleted, onClick,
}: {
  phase: string; title: string; isAccessible: boolean; isActive: boolean; isCompleted: boolean; onClick: () => void;
}) {
  const num = numMap[phase];
  return (
    <button
      type="button"
      onClick={isAccessible ? onClick : undefined}
      disabled={!isAccessible}
      className={`flex items-center gap-3 mb-3 w-full text-left ${isAccessible ? '' : 'opacity-60 cursor-not-allowed'}`}
    >
      <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center shrink-0
        ${isActive ? 'border-indigo-400 bg-indigo-50 shadow-[0_0_0_4px_rgba(99,102,241,0.1)]' : isAccessible ? 'border-indigo-200 bg-white' : 'border-slate-200 bg-slate-100'}`}
      >
        {!isAccessible ? <Lock size={16} className="text-slate-400" />
          : isCompleted ? <Check size={20} className="text-indigo-500" strokeWidth={3} />
          : <span className="text-indigo-600 font-bold text-lg">{num}</span>}
      </div>
      <div className="min-w-0">
        <div className={`text-[9px] font-bold uppercase tracking-widest ${isAccessible ? 'text-indigo-400' : 'text-slate-400'}`}>{PHASE_NAMES[phase]}</div>
        <div className={`font-bold text-sm leading-tight ${isAccessible ? 'text-slate-800' : 'text-slate-500'}`}>{title}</div>
      </div>
    </button>
  );
}

function TitleBoxStacked({ phase, title, desc, isAccessible }: { phase: string; title: string; desc: string; isAccessible: boolean }) {
  return (
    <motion.div
      animate={{
        borderColor: isAccessible ? '#e0e7ff' : '#e2e8f0',
        backgroundColor: isAccessible ? 'rgba(238,242,255,0.85)' : '#f8fafc',
        opacity: isAccessible ? 1 : 0.5,
      }}
      transition={{ duration: 0.6 }}
      className="w-44 backdrop-blur-sm border p-3 rounded-2xl shadow-sm text-center"
    >
      <motion.div animate={{ color: isAccessible ? '#818cf8' : '#94a3b8' }} transition={{ duration: 0.6 }} className="text-[9px] font-bold uppercase tracking-widest mb-0.5">
        {PHASE_NAMES[phase]}
      </motion.div>
      <motion.h4 animate={{ color: isAccessible ? '#312e81' : '#475569' }} transition={{ duration: 0.6 }} className="font-semibold text-sm mb-0.5 leading-tight">
        {title}
      </motion.h4>
      <p className="text-[11px] text-slate-500 leading-snug">{desc}</p>
    </motion.div>
  );
}
