import React, { useEffect, useRef } from 'react';
import { CanvasData } from '@/lib/types';
import { Check, Lock, FileText, Target, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PHASE_ORDER = ['diagnose', 'analyse', 'plan'];
const PHASE_NAMES: Record<string, string> = {
  diagnose: 'PHASE 1: DIAGNOSE',
  analyse: 'PHASE 2: ANALYSE',
  plan: 'PHASE 3: PLAN',
};

// Node definitions
const NODES = {
  diagnose: { top: '85%', left: '40%', boxSide: 'right' as 'right', svgY: 85, svgX: 40 },
  analyse:  { top: '50%', left: '45%', boxSide: 'left' as 'left',  svgY: 50, svgX: 45 },
  plan:     { top: '15%', left: '40%', boxSide: 'right' as 'right', svgY: 15, svgX: 40 },
};

export default function RoadmapCanvas({ data, currentPhase, onPhaseClick }: { data: CanvasData, currentPhase: string, onPhaseClick: (phase: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Scroll on mount and when phase changes
  useEffect(() => {
    if (containerRef.current) {
      const activeNode = NODES[currentPhase as keyof typeof NODES] || NODES.diagnose;
      const container = containerRef.current;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const targetTop = Math.max(0, (parseFloat(activeNode.top) / 100) * scrollHeight - clientHeight / 2);
      
      const startTop = container.scrollTop;
      const distance = targetTop - startTop;
      const duration = 4000; // 4 seconds
      let startTime: number | null = null;

      function animation(currentTime: number) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);
        
        // easeInOutQuad
        const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
        
        container.scrollTop = startTop + distance * ease;

        if (timeElapsed < duration) {
          requestAnimationFrame(animation);
        }
      }

      requestAnimationFrame(animation);
    }
  }, [currentPhase]);

  const maxReachedIdx = PHASE_ORDER.indexOf(data.phase || 'diagnose');

  // Helper to check if a phase is accessible
  const isAccessible = (phase: string) => PHASE_ORDER.indexOf(phase) <= maxReachedIdx;

  return (
    <div 
      className="w-full h-full overflow-y-auto relative bg-transparent" 
      ref={containerRef}
      style={{ scrollBehavior: 'smooth' }}
    >
      <div className="w-full relative min-h-[300vh]">
        
        {/* The SVG Curved Paths */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none" 
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {/* Base gray path (unlocked future) */}
          <path 
             d={`M ${NODES.diagnose.svgX} ${NODES.diagnose.svgY} C 35 70, 50 65, ${NODES.analyse.svgX} ${NODES.analyse.svgY} C 40 35, 35 30, ${NODES.plan.svgX} ${NODES.plan.svgY}`}
             fill="none"
             stroke="#e2e8f0"
             strokeWidth="0.3"
             strokeDasharray="1 1.5"
             vectorEffect="non-scaling-stroke"
          />
          {/* Animated active path 1 (Diagnose -> Analyse) */}
          <motion.path 
             d={`M ${NODES.diagnose.svgX} ${NODES.diagnose.svgY} C 35 70, 50 65, ${NODES.analyse.svgX} ${NODES.analyse.svgY}`}
             fill="none"
             stroke="#6366f1"
             strokeWidth="0.4"
             strokeDasharray="1 1.5"
             vectorEffect="non-scaling-stroke"
             initial={{ pathLength: 0, filter: 'drop-shadow(0px 0px 0px rgba(99,102,241,0))' }}
             animate={{ 
               pathLength: maxReachedIdx >= 1 ? 1 : 0,
               filter: maxReachedIdx >= 1 ? 'drop-shadow(0px 0px 4px rgba(99,102,241,0.8))' : 'drop-shadow(0px 0px 0px rgba(99,102,241,0))',
               strokeWidth: maxReachedIdx >= 1 ? 0.6 : 0.4
             }}
             transition={{ 
               pathLength: { duration: 2, ease: "easeInOut" },
               filter: { delay: 2, duration: 1 },
               strokeWidth: { delay: 2, duration: 1 }
             }}
          />
          {/* Animated active path 2 (Analyse -> Plan) */}
          <motion.path 
             d={`M ${NODES.analyse.svgX} ${NODES.analyse.svgY} C 40 35, 35 30, ${NODES.plan.svgX} ${NODES.plan.svgY}`}
             fill="none"
             stroke="#6366f1"
             strokeWidth="0.4"
             strokeDasharray="1 1.5"
             vectorEffect="non-scaling-stroke"
             initial={{ pathLength: 0, filter: 'drop-shadow(0px 0px 0px rgba(99,102,241,0))' }}
             animate={{ 
               pathLength: maxReachedIdx >= 2 ? 1 : 0,
               filter: maxReachedIdx >= 2 ? 'drop-shadow(0px 0px 4px rgba(99,102,241,0.8))' : 'drop-shadow(0px 0px 0px rgba(99,102,241,0))',
               strokeWidth: maxReachedIdx >= 2 ? 0.6 : 0.4
             }}
             transition={{ 
               pathLength: { duration: 2, ease: "easeInOut", delay: maxReachedIdx === 2 ? 0.5 : 0 },
               filter: { delay: maxReachedIdx === 2 ? 2.5 : 2, duration: 1 },
               strokeWidth: { delay: maxReachedIdx === 2 ? 2.5 : 2, duration: 1 }
             }}
          />
        </svg>

        {/* --- PHASE 1: DIAGNOSE --- */}
        <PhaseNode 
           phase="diagnose"
           title="Problem Identifikation"
           desc="Wir finden heraus wo die echte Lücke sitzt und schärfen die Pain Points."
           nodeConfig={NODES.diagnose}
           isAccessible={isAccessible('diagnose')}
           isActive={currentPhase === 'diagnose'}
           isCompleted={maxReachedIdx > 0}
           delayColorChange={0}
           onClick={() => onPhaseClick('diagnose')}
        />
        {/* Pain Points Cards (Phase 1) */}
        <AnimatePresence>
          {data.pain_points && data.pain_points.length > 0 && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
               className="absolute top-[80%] left-[60%] w-80 space-y-4"
             >
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Identifizierte Pain Points</h3>
                {data.pain_points.map((p, i) => (
                  <div key={i} className="bg-white border border-red-100 p-4 rounded-xl shadow-sm text-sm">
                     <div className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                       <AlertTriangle size={14} className="text-red-400" /> {p.title}
                     </div>
                     <p className="text-gray-500">{p.description}</p>
                  </div>
                ))}
             </motion.div>
          )}
        </AnimatePresence>


        {/* --- PHASE 2: ANALYSE --- */}
        <PhaseNode 
           phase="analyse"
           title="Tool & Use-Case Mapping"
           desc="Wir mappen die Probleme auf konkrete KI-Tools und priorisieren die Use-Cases."
           nodeConfig={NODES.analyse}
           isAccessible={isAccessible('analyse')}
           isActive={currentPhase === 'analyse'}
           isCompleted={maxReachedIdx > 1}
           delayColorChange={1.5}
           onClick={() => onPhaseClick('analyse')}
        />
        {/* Use Cases Cards (Phase 2) */}
        <AnimatePresence>
          {data.use_cases && data.use_cases.length > 0 && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
               className="absolute top-[48%] left-[65%] w-80 space-y-4"
             >
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Priorisierte Use-Cases</h3>
                {data.use_cases.map((uc, i) => (
                  <div key={i} className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm text-sm">
                     <div className="font-bold text-indigo-900 flex items-center gap-2 mb-1">
                       <Target size={14} className="text-indigo-500" /> {uc.title}
                     </div>
                     <div className="flex gap-2 text-xs text-indigo-700/80 mt-2">
                       <span className="bg-indigo-100/50 px-2 py-0.5 rounded">Aufwand: {uc.effort}</span>
                       <span className="bg-indigo-100/50 px-2 py-0.5 rounded">Impact: {uc.impact}</span>
                     </div>
                  </div>
                ))}
             </motion.div>
          )}
        </AnimatePresence>


        {/* --- PHASE 3: PLAN --- */}
        <PhaseNode 
           phase="plan"
           title="Implementierungsplan"
           desc="Wir erstellen die genauen Workflows und definieren den Rollout."
           nodeConfig={NODES.plan}
           isAccessible={isAccessible('plan')}
           isActive={currentPhase === 'plan'}
           isCompleted={maxReachedIdx > 2}
           delayColorChange={1.5}
           onClick={() => onPhaseClick('plan')}
        />
        {/* Documents Cards (Phase 3) */}
        <AnimatePresence>
          {data.documents && data.documents.length > 0 && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
               className="absolute top-[12%] left-[60%] w-80 space-y-4"
             >
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Workflows & Dokumente</h3>
                {data.documents.map((doc, i) => (
                  <div key={i} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-sm">
                     <div className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                       <FileText size={14} className="text-blue-500" /> {doc.title}
                     </div>
                     <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 font-mono whitespace-pre-wrap max-h-32 overflow-hidden">
                       {doc.content.substring(0, 100)}...
                     </div>
                  </div>
                ))}
             </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// --- Subcomponents ---

function PhaseNode({ 
  phase, title, desc, nodeConfig, isAccessible, isActive, isCompleted, delayColorChange, onClick 
}: { 
  phase: string, title: string, desc: string, nodeConfig: any, 
  isAccessible: boolean, isActive: boolean, isCompleted: boolean, delayColorChange: number, onClick: () => void 
}) {
  
  const numMap: Record<string, string> = { diagnose: '1', analyse: '2', plan: '3' };
  const num = numMap[phase];

  return (
    <div 
      className="absolute flex items-center group"
      style={{ top: nodeConfig.top, left: nodeConfig.left, transform: 'translate(-50%, -50%)' }}
    >
      {/* Title Box (Left) */}
      {nodeConfig.boxSide === 'left' && (
        <TitleBox phase={phase} title={title} desc={desc} side="left" isAccessible={isAccessible} delay={delayColorChange} />
      )}

      {/* The Node Circle */}
      <div className="relative">
        {/* Tooltip for locked phases */}
        {!isAccessible && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 bg-slate-800 text-white text-xs p-2 rounded-lg text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            Diese Phase wurde noch nicht erreicht.
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
          </div>
        )}

        <motion.button 
          onClick={isAccessible ? onClick : undefined}
          layout
          initial={false}
          animate={{
            backgroundColor: !isAccessible ? '#f1f5f9' : isActive ? '#eef2ff' : '#ffffff',
            borderColor: !isAccessible ? '#e2e8f0' : isActive ? '#818cf8' : '#c7d2fe',
            opacity: !isAccessible ? 0.6 : 1
          }}
          transition={{ duration: 0.8, delay: isAccessible ? delayColorChange : 0 }}
          className={`w-28 h-28 rounded-full flex items-center justify-center relative z-10 
            ${!isAccessible ? 'cursor-not-allowed border-2' : isActive ? 'border-[3px] shadow-[0_0_0_6px_rgba(99,102,241,0.1)]' : 'border-2 hover:border-indigo-400 hover:shadow-lg cursor-pointer'}
          `}
        >
          {/* Inner dotted ring like the sketch */}
          <motion.div 
            animate={{ borderColor: isAccessible ? '#a5b4fc' : '#cbd5e1' }}
            transition={{ duration: 0.8, delay: isAccessible ? delayColorChange : 0 }}
            className="absolute inset-2 rounded-full border border-dashed"
          ></motion.div>
          
          <div className="text-3xl font-bold text-slate-700 z-10 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              {!isAccessible ? (
                <motion.div key="lock" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ delay: delayColorChange }}>
                   <Lock size={28} className="text-slate-400" />
                </motion.div>
              ) : isCompleted ? (
                <motion.div key="check" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ delay: 0 }}>
                   <Check size={36} className="text-indigo-500" strokeWidth={3} />
                </motion.div>
              ) : (
                <motion.span key="num" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ delay: delayColorChange }} className="text-indigo-600">
                   {num}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.button>
      </div>

      {/* Title Box (Right) */}
      {nodeConfig.boxSide === 'right' && (
        <TitleBox phase={phase} title={title} desc={desc} side="right" isAccessible={isAccessible} delay={delayColorChange} />
      )}
    </div>
  );
}

function TitleBox({ phase, title, desc, side, isAccessible, delay }: { phase: string, title: string, desc: string, side: 'left' | 'right', isAccessible: boolean, delay: number }) {
  return (
    <div className={`flex items-center ${side === 'left' ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
      <motion.div 
        animate={{ backgroundColor: isAccessible ? '#c7d2fe' : '#e2e8f0' }}
        transition={{ duration: 0.8, delay: isAccessible ? delay : 0 }}
        className="w-12 h-[2px]"
      ></motion.div>
      <motion.div 
        animate={{ 
          borderColor: isAccessible ? '#e0e7ff' : '#e2e8f0',
          backgroundColor: isAccessible ? 'rgba(238, 242, 255, 0.8)' : '#f8fafc',
          opacity: isAccessible ? 1 : 0.5
        }}
        transition={{ duration: 0.8, delay: isAccessible ? delay : 0 }}
        className="w-64 backdrop-blur-sm border p-4 rounded-2xl shadow-sm"
      >
         <motion.div 
           animate={{ color: isAccessible ? '#818cf8' : '#94a3b8' }}
           transition={{ duration: 0.8, delay: isAccessible ? delay : 0 }}
           className="text-[10px] font-bold uppercase tracking-widest mb-1"
         >
           {PHASE_NAMES[phase]}
         </motion.div>
         <motion.h4 
           animate={{ color: isAccessible ? '#312e81' : '#475569' }}
           transition={{ duration: 0.8, delay: isAccessible ? delay : 0 }}
           className="font-bold mb-1"
         >
           {title}
         </motion.h4>
         <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </motion.div>
    </div>
  );
}
