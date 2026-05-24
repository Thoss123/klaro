import React from 'react';
import { motion } from 'framer-motion';

type PhaseSectionProps = {
  phase: string;
  phaseNumber: number;
  title: string;
  subtitle: string;
  isActive: boolean;
  isPast: boolean;
  isFuture: boolean;
  onCircleClick: () => void;
  children: React.ReactNode;
};

export default function PhaseSection({
  phaseNumber,
  title,
  subtitle,
  isActive,
  isPast,
  isFuture,
  onCircleClick,
  children
}: PhaseSectionProps) {
  
  // Determine styles based on state
  const circleBg = isActive ? 'bg-indigo-600' : isPast ? 'bg-emerald-500' : 'bg-gray-200';
  const circleText = isActive || isPast ? 'text-white' : 'text-gray-400';
  const opacity = isFuture ? 'opacity-40' : 'opacity-100';

  return (
    <div className={`relative w-full max-w-3xl mx-auto py-16 flex flex-col items-center transition-opacity duration-500 ${opacity}`}>
      
      {/* Title Area */}
      <div className="text-center mb-12 bg-white/80 backdrop-blur-sm px-6 py-3 rounded-2xl border border-gray-100 shadow-sm relative z-10">
        <h2 className="text-2xl font-bold text-gray-900">Phase {phaseNumber}: {title}</h2>
        <p className="text-gray-500 mt-1">{subtitle}</p>
      </div>

      {/* Content Area */}
      <div className="w-full flex flex-col items-center gap-12 relative z-10">
        {children}
        
        {/* Placeholder if empty but active/past */}
        {React.Children.count(children) === 0 && !isFuture && (
           <div className="text-gray-400 italic text-sm py-8 bg-white/50 px-6 rounded-xl border border-gray-100 border-dashed">
             Noch keine Inhalte generiert.
           </div>
        )}
      </div>

      {/* Numbered Circle (The button to open chat for this phase) */}
      <motion.button 
        whileHover={{ scale: isFuture ? 1 : 1.1 }}
        whileTap={{ scale: isFuture ? 1 : 0.95 }}
        onClick={isFuture ? undefined : onCircleClick}
        className={`relative z-20 mt-16 w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-md transition-colors ${circleBg} ${circleText} ${isFuture ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}`}
      >
        {phaseNumber}
      </motion.button>
      
    </div>
  );
}
