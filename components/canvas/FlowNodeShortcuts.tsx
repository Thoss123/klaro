"use client";

import React from 'react';
import { GitBranch, GitMerge, Split } from 'lucide-react';
import type { WorkflowStep } from '@/lib/types';
import { createIfStep, createMergeStep, createSwitchStep } from '@/lib/workflow-graph';

const SHORTCUTS = [
  { label: 'IF', title: 'IF-Node einfügen', icon: GitBranch, iconClass: 'text-amber-500', factory: createIfStep },
  { label: 'Switch', title: 'Switch-Node einfügen', icon: Split, iconClass: 'text-violet-500', factory: createSwitchStep },
  { label: 'Merge', title: 'Merge-Node einfügen', icon: GitMerge, iconClass: 'text-indigo-500', factory: createMergeStep },
] as const;

export default function FlowNodeShortcuts({
  onInsert,
}: {
  onInsert: (step: WorkflowStep) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SHORTCUTS.map(({ label, title, icon: Icon, iconClass, factory }) => (
        <button
          key={label}
          type="button"
          onClick={() => onInsert(factory())}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 shadow-sm hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
          title={title}
        >
          <Icon size={14} className={iconClass} />
          {label}
        </button>
      ))}
    </div>
  );
}
