import React, { useEffect, useRef, useState } from 'react';
import { CanvasData, CanvasDocument, PainPoint, Workflow } from '@/lib/types';
import { Check, Lock, FileText, Target, AlertTriangle, ArrowRight, Cpu, Zap, GitBranch, Send, Wrench, User, Download, X, Clock, Euro, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

const PHASE_ORDER = ['diagnose', 'analyse', 'plan', 'umsetzung'];
const PHASE_NAMES: Record<string, string> = {
  diagnose:  'PHASE 1: DIAGNOSE',
  analyse:   'PHASE 2: TOOLS & SETUP',
  plan:      'PHASE 3: WORKFLOWS',
  umsetzung: 'PHASE 4: UMSETZUNG',
};

// Node definitions — 4 phases on a tall vertical canvas
const NODES = {
  diagnose:  { top: '90%', left: '40%', boxSide: 'right' as const, svgY: 90, svgX: 40 },
  analyse:   { top: '65%', left: '45%', boxSide: 'left'  as const, svgY: 65, svgX: 45 },
  plan:      { top: '40%', left: '40%', boxSide: 'right' as const, svgY: 40, svgX: 40 },
  umsetzung: { top: '13%', left: '45%', boxSide: 'left'  as const, svgY: 13, svgX: 45 },
};

const numMap: Record<string, string> = { diagnose: '1', analyse: '2', plan: '3', umsetzung: '4' };

const STEP_ICONS: Record<string, React.ReactNode> = {
  trigger:  <Zap size={13} />,
  action:   <ArrowRight size={13} />,
  ai:       <Cpu size={13} />,
  decision: <GitBranch size={13} />,
  output:   <Send size={13} />,
};

// Strip raw IDs like "(pp_1)" from display titles
const cleanTitle = (s: string) => s.replace(/\s*\([a-z]+_\d+\)/gi, '').trim();

// Staggered card entrance animation
const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.07, duration: 0.25, ease: 'easeOut' }
  }),
};

export default function RoadmapCanvas({ data, currentPhase, onPhaseClick }: {
  data: CanvasData
  currentPhase: string
  onPhaseClick: (phase: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openDoc, setOpenDoc] = useState<CanvasDocument | null>(null);
  const [openWorkflow, setOpenWorkflow] = useState<Workflow | null>(null);

  // Smooth-scroll active node into view when phase changes
  useEffect(() => {
    if (containerRef.current) {
      const activeNode = NODES[currentPhase as keyof typeof NODES] || NODES.diagnose;
      const container = containerRef.current;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const targetTop = Math.max(0, (parseFloat(activeNode.top) / 100) * scrollHeight - clientHeight / 2);

      const startTop = container.scrollTop;
      const distance = targetTop - startTop;
      const duration = 2500;
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

  const maxReachedIdx = PHASE_ORDER.indexOf(data.phase || 'diagnose');
  const isAccessible = (phase: string) => PHASE_ORDER.indexOf(phase) <= maxReachedIdx;

  const painPoints = data.pain_points || [];
  const useCases   = data.use_cases   || [];
  const workflows  = data.workflows   || [];
  const documents  = data.documents   || [];
  const company    = data.company;
  const hasCompany = !!(company?.offer || company?.target_customers || company?.acquisition || company?.process_steps?.length);

  const sortedPainPoints = [...painPoints].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  return (
    <div className="w-full h-full overflow-y-auto relative bg-transparent" ref={containerRef} style={{ scrollBehavior: 'smooth' }}>
      <div className="w-full relative min-h-[420vh]">

        {/* SVG Curved Paths */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path
            d={`M ${NODES.diagnose.svgX} ${NODES.diagnose.svgY} C 35 80, 50 78, ${NODES.analyse.svgX} ${NODES.analyse.svgY} C 40 55, 35 52, ${NODES.plan.svgX} ${NODES.plan.svgY} C 35 30, 50 28, ${NODES.umsetzung.svgX} ${NODES.umsetzung.svgY}`}
            fill="none" stroke="#e2e8f0" strokeWidth="0.3" strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke"
          />
          <ActivePath d={`M ${NODES.diagnose.svgX} ${NODES.diagnose.svgY} C 35 80, 50 78, ${NODES.analyse.svgX} ${NODES.analyse.svgY}`} active={maxReachedIdx >= 1} />
          <ActivePath d={`M ${NODES.analyse.svgX} ${NODES.analyse.svgY} C 40 55, 35 52, ${NODES.plan.svgX} ${NODES.plan.svgY}`} active={maxReachedIdx >= 2} />
          <ActivePath d={`M ${NODES.plan.svgX} ${NODES.plan.svgY} C 35 30, 50 28, ${NODES.umsetzung.svgX} ${NODES.umsetzung.svgY}`} active={maxReachedIdx >= 3} />
        </svg>

        {/* ── PHASE 1: DIAGNOSE ── */}
        <PhaseNode
          phase="diagnose" title="Problem Identifikation"
          desc="Wir finden heraus wo die echte Lücke sitzt und schärfen die Pain Points."
          nodeConfig={NODES.diagnose} isAccessible={isAccessible('diagnose')}
          isActive={currentPhase === 'diagnose'} isCompleted={maxReachedIdx > 0}
          onClick={() => onPhaseClick('diagnose')}
        />
        <AnimatePresence>
          {hasCompany && (
            <div className="absolute top-[92%] left-[58%] w-80 space-y-2">
              <SectionLabel>Unternehmen</SectionLabel>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-indigo-100 p-4 rounded-xl shadow-sm text-sm"
              >
                <div className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                  <Building2 size={14} className="text-indigo-500 shrink-0" />
                  Profil
                </div>
                {company?.offer && <p className="text-gray-600 mb-1"><span className="font-semibold text-gray-700">Angebot: </span>{company.offer}</p>}
                {company?.target_customers && <p className="text-gray-600 mb-1"><span className="font-semibold text-gray-700">Zielkunden: </span>{company.target_customers}</p>}
                {company?.acquisition && <p className="text-gray-600 mb-1"><span className="font-semibold text-gray-700">Akquise: </span>{company.acquisition}</p>}
                {company?.process_steps && company.process_steps.length > 0 && (
                  <ol className="list-decimal list-inside text-gray-500 space-y-0.5 mt-2 border-t border-gray-100 pt-2">
                    {company.process_steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {sortedPainPoints.length > 0 && (
            <div className={`absolute ${hasCompany ? 'top-[78%]' : 'top-[86%]'} left-[58%] w-80 space-y-3`}>
              <SectionLabel>Identifizierte Pain Points</SectionLabel>
              {sortedPainPoints.map((p, i) => (
                <motion.div
                  key={p.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  layout
                  className="bg-white border border-red-100 p-4 rounded-xl shadow-sm text-sm"
                >
                  <div className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-red-400 shrink-0" />
                    <span className="flex-1">{cleanTitle(p.title)}</span>
                    {p.rank && <span className="text-[10px] font-bold bg-red-50 text-red-500 px-1.5 py-0.5 rounded">#{p.rank}</span>}
                  </div>
                  <p className="text-gray-500 mb-2">{p.description}</p>
                  {(p.frequency || p.effort) && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {p.frequency && <Chip icon={<Clock size={10} />}>{p.frequency}</Chip>}
                      {p.effort && <Chip icon={<Clock size={10} />}>{p.effort}</Chip>}
                    </div>
                  )}
                  {p.details && Object.keys(p.details).length > 0 && (
                    <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
                      {Object.entries(p.details).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="font-semibold text-gray-600">{k.replace(/_/g, ' ')}: </span>
                          <span className="text-gray-500">{v as string}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* ── PHASE 2: TOOLS & SETUP ── */}
        <PhaseNode
          phase="analyse" title="Tools & Setup"
          desc="Wir klären wer umsetzt und welche Plattform passt."
          nodeConfig={NODES.analyse} isAccessible={isAccessible('analyse')}
          isActive={currentPhase === 'analyse'} isCompleted={maxReachedIdx > 1}
          onClick={() => onPhaseClick('analyse')}
        />
        <AnimatePresence>
          {(data.implementer || useCases.length > 0) && (
            <div className="absolute top-[60%] left-[6%] w-80 space-y-3">
              {/* Implementer profile */}
              {data.implementer && (
                <motion.div
                  key="implementer"
                  variants={cardVariants}
                  custom={0}
                  initial="hidden"
                  animate="visible"
                  layout
                  className="bg-violet-50 border border-violet-100 p-4 rounded-xl shadow-sm text-sm"
                >
                  <div className="font-bold text-violet-900 flex items-center gap-2 mb-2">
                    <User size={14} className="text-violet-500" /> Umsetzer-Profil
                  </div>
                  <div className="text-xs text-violet-800/80 space-y-1">
                    <div>{data.implementer.who}</div>
                    <div>Skill: <span className="font-semibold">{data.implementer.skill_level}</span></div>
                    {data.implementer.automation_experience && (
                      <div className="text-violet-700/70">{data.implementer.automation_experience}</div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Use cases (high-level, from Phase 2) */}
              {useCases.length > 0 && (
                <>
                  <SectionLabel>Use Cases</SectionLabel>
                  {useCases.map((uc, i) => (
                    <motion.div
                      key={uc.id}
                      custom={i + 1}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      layout
                      className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm text-sm"
                    >
                      <div className="font-bold text-indigo-900 flex items-center gap-2 mb-2">
                        <Target size={14} className="text-indigo-500" /> {cleanTitle(uc.title)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {uc.tool && <Chip icon={<Cpu size={10} />}>{uc.tool}</Chip>}
                        {uc.effort && <Chip>Aufwand: {uc.effort}</Chip>}
                        {uc.impact && <Chip>Impact: {uc.impact}</Chip>}
                        {uc.setup_effort && <Chip icon={<Wrench size={10} />}>Setup: {uc.setup_effort}</Chip>}
                        {uc.cost_monthly && <Chip icon={<Euro size={10} />}>{uc.cost_monthly}</Chip>}
                        {uc.roi && <Chip>{uc.roi}</Chip>}
                      </div>
                    </motion.div>
                  ))}
                </>
              )}
            </div>
          )}
        </AnimatePresence>

        {/* ── PHASE 3: WORKFLOWS ── */}
        <PhaseNode
          phase="plan" title="Workflows & Priorisierung"
          desc="Wir skizzieren die konkreten Automatisierungs-Workflows für jeden Pain Point."
          nodeConfig={NODES.plan} isAccessible={isAccessible('plan')}
          isActive={currentPhase === 'plan'} isCompleted={maxReachedIdx > 2}
          onClick={() => onPhaseClick('plan')}
        />
        <AnimatePresence>
          {workflows.length > 0 && (
            <div className="absolute top-[34%] left-[52%] space-y-3">
              <SectionLabel>Automatisierungs-Workflows</SectionLabel>
              {workflows.map((wf, i) => {
                const linkedPP = painPoints.find(p => p.id === wf.linked_pain_point);
                return (
                  <motion.button
                    key={wf.id}
                    custom={i}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    layout
                    onClick={() => setOpenWorkflow(wf)}
                    className="w-full text-left bg-white border-2 border-gray-200 rounded-xl p-3 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                        <GitBranch size={15} className="text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-800 text-xs truncate">{cleanTitle(wf.title)}</div>
                        {linkedPP && <div className="text-[10px] text-gray-400 truncate">{cleanTitle(linkedPP.title)}</div>}
                      </div>
                      <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-gray-400">{wf.steps?.length ?? 0} Schritte</span>
                        <ArrowRight size={13} className="text-gray-300 group-hover:text-indigo-400 transition-colors" />
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {/* ── PHASE 4: UMSETZUNG ── */}
        <PhaseNode
          phase="umsetzung" title="Umsetzung"
          desc="Wir setzen Schritt für Schritt um — Detail für Detail."
          nodeConfig={NODES.umsetzung} isAccessible={isAccessible('umsetzung')}
          isActive={currentPhase === 'umsetzung'} isCompleted={maxReachedIdx > 3}
          onClick={() => onPhaseClick('umsetzung')}
        />

        {/* Documents (Phase 3 & 4) — clickable to open formatted modal */}
        <AnimatePresence>
          {documents.length > 0 && (
            <div className="absolute top-[8%] left-[6%] w-80 space-y-3">
              <SectionLabel>Pläne & Dokumente</SectionLabel>
              {documents.map((doc, i) => (
                <motion.button
                  key={doc.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  layout
                  onClick={() => setOpenDoc(doc)}
                  className="w-full text-left bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-sm hover:border-indigo-300 hover:shadow-md transition-all group"
                >
                  <div className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-blue-500 shrink-0" />
                    <span className="flex-1">{cleanTitle(doc.title)}</span>
                    <span className="text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">Öffnen →</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-xs text-gray-500 line-clamp-3 leading-relaxed">
                    {doc.content.replace(/[#*`_>-]/g, '').substring(0, 120)}…
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </AnimatePresence>

      </div>

      {/* Document modal */}
      <DocumentModal doc={openDoc} onClose={() => setOpenDoc(null)} />

      {/* Workflow fullscreen modal */}
      <WorkflowModal workflow={openWorkflow} painPoints={painPoints} onClose={() => setOpenWorkflow(null)} />
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{children}</h3>;
}

function Chip({ children, icon }: { children: React.ReactNode, icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 bg-white/70 border border-gray-200 text-[11px] px-2 py-0.5 rounded text-gray-600">
      {icon}{children}
    </span>
  );
}

function WorkflowCard({ workflow, painPoints }: { workflow: Workflow, painPoints: PainPoint[] }) {
  const linkedPP = painPoints.find(p => p.id === workflow.linked_pain_point);

  const renderIcon = (type: string) => {
    const size = 28;
    switch(type) {
      case 'trigger':  return <Zap size={size} className="text-orange-500" />;
      case 'action':   return <Cpu size={size} className="text-indigo-500" />;
      case 'ai':       return <Cpu size={size} className="text-violet-500" />;
      case 'decision': return <GitBranch size={size} className="text-amber-500" />;
      case 'output':   return <Send size={size} className="text-emerald-500" />;
      default:         return <Cpu size={size} className="text-indigo-500" />;
    }
  };

  // Node and label share the same width so connector -mx math is exact.
  // Circle: w-3.5 = 14px → half = 7px → -mx-[7px]
  // Node h-[90px] → center = 45px → mt = 45 - 7 = 38px
  const NODE_W = 'w-[120px]';

  return (
    <div className="flex items-start">
      {workflow.steps.map((step, i) => (
        <React.Fragment key={step.id || i}>
          {/* Node */}
          <div className={`flex flex-col items-center ${NODE_W}`}>
            <div className="relative w-full">
              {step.type === 'trigger' && (
                <div className="absolute -left-0.5 -top-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white z-30" />
              )}
              <div className="w-full h-[90px] bg-white rounded-xl border-2 border-gray-200 shadow-sm flex items-center justify-center hover:border-indigo-300 hover:shadow-md transition-all">
                {renderIcon(step.type || 'action')}
              </div>
            </div>
            <div className="mt-2.5 w-full text-[11px] text-gray-600 font-medium text-center leading-snug px-1">
              {step.label}
            </div>
          </div>

          {/* Connector: plain line, centered on node height (90/2 - 1 = 44) */}
          {i < workflow.steps.length - 1 && (
            <div className="h-[2px] w-12 bg-gray-300 flex-shrink-0 mt-[44px]" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function WorkflowModal({ workflow, painPoints, onClose }: { workflow: Workflow | null, painPoints: PainPoint[], onClose: () => void }) {
  if (!workflow) return null;
  const linkedPP = painPoints.find(p => p.id === workflow.linked_pain_point);

  const renderIcon = (type: string) => {
    const size = 30;
    switch(type) {
      case 'trigger':  return <Zap size={size} className="text-orange-500" />;
      case 'action':   return <Cpu size={size} className="text-indigo-500" />;
      case 'ai':       return <Cpu size={size} className="text-violet-500" />;
      case 'decision': return <GitBranch size={size} className="text-amber-500" />;
      case 'output':   return <Send size={size} className="text-emerald-500" />;
      default:         return <Cpu size={size} className="text-indigo-500" />;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GitBranch size={16} className="text-amber-600" />
                <h2 className="font-bold text-gray-900 text-lg">{cleanTitle(workflow.title)}</h2>
              </div>
              {linkedPP && (
                <p className="text-sm text-gray-500 pl-6">Löst Pain Point: {cleanTitle(linkedPP.title)}</p>
              )}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors ml-4 flex-shrink-0">
              <X size={18} />
            </button>
          </div>

          {/* Node canvas */}
          <div className="overflow-x-auto bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:24px_24px] p-10">
            <div className="flex items-start min-w-max mx-auto">
              {workflow.steps.map((step, i) => (
                <React.Fragment key={step.id || i}>
                  <div className="flex flex-col items-center w-[130px]">
                    <div className="relative w-full">
                      {step.type === 'trigger' && (
                        <div className="absolute -left-0.5 -top-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white z-30" />
                      )}
                      <div className="w-full h-[96px] bg-white rounded-xl border-2 border-gray-200 shadow-sm flex items-center justify-center hover:border-indigo-300 transition-all">
                        {renderIcon(step.type || 'action')}
                      </div>
                    </div>
                    <div className="mt-3 w-full text-xs text-gray-700 font-medium text-center leading-snug px-1">
                      {step.label}
                    </div>
                  </div>

                  {/* Connector: plain line, centered on node height (96/2 - 1 = 47) */}
                  {i < workflow.steps.length - 1 && (
                    <div className="h-[2px] w-14 bg-gray-300 flex-shrink-0 mt-[47px]" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
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

function PhaseNode({
  phase, title, desc, nodeConfig, isAccessible, isActive, isCompleted, onClick
}: {
  phase: string, title: string, desc: string, nodeConfig: any,
  isAccessible: boolean, isActive: boolean, isCompleted: boolean, onClick: () => void
}) {
  const num = numMap[phase];
  return (
    <div className="absolute flex items-center group" style={{ top: nodeConfig.top, left: nodeConfig.left, transform: 'translate(-50%, -50%)' }}>
      {nodeConfig.boxSide === 'left' && <TitleBox phase={phase} title={title} desc={desc} side="left" isAccessible={isAccessible} />}
      <div className="relative">
        {!isAccessible && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 bg-slate-800 text-white text-xs p-2 rounded-lg text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            Diese Phase wurde noch nicht erreicht.
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
          </div>
        )}
        <motion.button
          onClick={isAccessible ? onClick : undefined}
          layout initial={false}
          animate={{
            backgroundColor: !isAccessible ? '#f1f5f9' : isActive ? '#eef2ff' : '#ffffff',
            borderColor: !isAccessible ? '#e2e8f0' : isActive ? '#818cf8' : '#c7d2fe',
            opacity: !isAccessible ? 0.6 : 1
          }}
          transition={{ duration: 0.6 }}
          className={`w-28 h-28 rounded-full flex items-center justify-center relative z-10
            ${!isAccessible ? 'cursor-not-allowed border-2' : isActive ? 'border-[3px] shadow-[0_0_0_6px_rgba(99,102,241,0.1)]' : 'border-2 hover:border-indigo-400 hover:shadow-lg cursor-pointer'}`}
        >
          <motion.div animate={{ borderColor: isAccessible ? '#a5b4fc' : '#cbd5e1' }} transition={{ duration: 0.6 }} className="absolute inset-2 rounded-full border border-dashed"></motion.div>
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
      {nodeConfig.boxSide === 'right' && <TitleBox phase={phase} title={title} desc={desc} side="right" isAccessible={isAccessible} />}
    </div>
  );
}

function TitleBox({ phase, title, desc, side, isAccessible }: { phase: string, title: string, desc: string, side: 'left' | 'right', isAccessible: boolean }) {
  return (
    <div className={`flex items-center ${side === 'left' ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
      <motion.div animate={{ backgroundColor: isAccessible ? '#c7d2fe' : '#e2e8f0' }} transition={{ duration: 0.6 }} className="w-12 h-[2px]"></motion.div>
      <motion.div
        animate={{ borderColor: isAccessible ? '#e0e7ff' : '#e2e8f0', backgroundColor: isAccessible ? 'rgba(238, 242, 255, 0.8)' : '#f8fafc', opacity: isAccessible ? 1 : 0.5 }}
        transition={{ duration: 0.6 }}
        className="w-64 backdrop-blur-sm border p-4 rounded-2xl shadow-sm"
      >
        <motion.div animate={{ color: isAccessible ? '#818cf8' : '#94a3b8' }} transition={{ duration: 0.6 }} className="text-[10px] font-bold uppercase tracking-widest mb-1">
          {PHASE_NAMES[phase]}
        </motion.div>
        <motion.h4 animate={{ color: isAccessible ? '#312e81' : '#475569' }} transition={{ duration: 0.6 }} className="font-bold mb-1">
          {title}
        </motion.h4>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </motion.div>
    </div>
  );
}
