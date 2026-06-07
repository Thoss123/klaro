"use client";

/**
 * Custom React Flow node — n8n-Stil: Icon im Kasten, Label darunter,
 * große Verbindungspunkte, Hover-Toolbar (Konfig / Deaktivieren / Löschen).
 */

import React, { memo, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertCircle, Check, Settings2, Power, Trash2, Plus } from 'lucide-react';
import N8nNodeIcon from './N8nNodeIcon';
import {
  getMergeInputCount,
  getSwitchOutputCount,
  isIfStep,
  isMergeStep,
  isSwitchStep,
} from '@/lib/workflow-graph';
import { shortLabel } from '@/lib/short-label';
import { aiSlotsFor, subNodeCount } from '@/lib/ai-subnodes';
import type { WorkflowStep } from '@/lib/types';
import type { N8nNodeState } from './N8nNode';

export type FlowNodeData = {
  step: WorkflowStep;
  state: N8nNodeState;
  interactive?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onToggleDisabled?: () => void;
  onAddSubNode?: (slot: string) => void;
};

const ICON_SIZE = 76;
const LABEL_MAX_W = 168;
const HANDLE_CLASS = '!w-[15px] !h-[15px] !border-2 !border-white !shadow-sm';
const SWITCH_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7'];

function WorkflowFlowNodeComponent({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const { step, state, onClick, onDelete, onToggleDisabled, onAddSubNode, interactive } = data;
  const aiSlots = aiSlotsFor(step.n8nType);
  const isAiParent = aiSlots.length > 0;
  const isSubNode = !!step.subNodeOf;
  const isIf = isIfStep(step);
  const isSwitch = isSwitchStep(step);
  const isMerge = isMergeStep(step);
  const switchOutputs = getSwitchOutputCount(step);
  const mergeInputs = getMergeInputCount(step);
  const disabled = !!step.disabled;
  const [hovered, setHovered] = useState(false);

  const border =
    disabled ? 'border-gray-300'
    : selected ? 'border-indigo-500 ring-2 ring-indigo-200'
    : state === 'configured' ? 'border-green-500'
    : state === 'needsCredential' ? 'border-red-400'
    : 'border-[#c8c8d4]';

  const columnW = isSwitch ? 220 : LABEL_MAX_W;
  const showToolbar = interactive && hovered;

  const stop = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn?.();
  };

  return (
    <div
      className="relative flex flex-col items-center pointer-events-auto"
      style={{ width: columnW }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover-Toolbar (n8n-Stil) */}
      {showToolbar && (
        <div className="nodrag absolute -top-9 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-md">
          <button
            type="button"
            title="Konfigurieren"
            onClick={stop(onClick)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <Settings2 size={14} />
          </button>
          <button
            type="button"
            title={disabled ? 'Aktivieren' : 'Deaktivieren'}
            onClick={stop(onToggleDisabled)}
            className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100 ${disabled ? 'text-amber-500' : 'text-gray-500 hover:text-gray-800'}`}
          >
            <Power size={14} />
          </button>
          {step.type !== 'trigger' && (
            <button
              type="button"
              title="Löschen"
              onClick={stop(onDelete)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onClick}
        style={{ width: ICON_SIZE, height: ICON_SIZE, opacity: disabled ? 0.5 : 1 }}
        className={`relative rounded-xl border-2 bg-white shadow-sm flex items-center justify-center transition-shadow hover:shadow-md ${border}`}
        aria-label={step.label}
      >
        {isMerge ? (
          Array.from({ length: mergeInputs }, (_, i) => {
            const pct = mergeInputs === 1 ? 50 : 20 + (i / (mergeInputs - 1)) * 60;
            return (
              <Handle
                key={`in-${i}`}
                id={`input-${i}`}
                type="target"
                position={Position.Left}
                style={{ top: `${pct}%` }}
                className={`${HANDLE_CLASS} !bg-indigo-500`}
              />
            );
          })
        ) : !isSubNode ? (
          <Handle type="target" position={Position.Left} className={`${HANDLE_CLASS} !bg-[#7a7a90]`} />
        ) : null}

        {/* Sub-Node (Chat Model/Memory/Tool): Ausgang oben → dockt am Parent an */}
        {isSubNode && (
          <Handle id="ai_out" type="source" position={Position.Top} className={`${HANDLE_CLASS} !bg-violet-500`} />
        )}

        <N8nNodeIcon
          tool={step.tool || step.n8nType?.split('.').pop()}
          type={step.type}
          n8nType={step.n8nType}
          label={step.label}
          size={36}
          color="#6366f1"
        />

        {state === 'configured' && !disabled && (
          <span className="absolute -bottom-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-green-500">
            <Check size={11} className="text-white" strokeWidth={3} />
          </span>
        )}
        {state === 'needsCredential' && !disabled && (
          <span className="absolute -bottom-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500">
            <AlertCircle size={11} className="text-white" strokeWidth={2.5} />
          </span>
        )}

        {isIf && (
          <>
            <Handle
              id="true"
              type="source"
              position={Position.Right}
              style={{ top: '35%' }}
              className={`${HANDLE_CLASS} !bg-green-500`}
            />
            <Handle
              id="false"
              type="source"
              position={Position.Right}
              style={{ top: '65%' }}
              className={`${HANDLE_CLASS} !bg-amber-500`}
            />
            <span className="absolute -right-1 top-[30%] text-[8px] text-green-600 font-medium translate-x-full pr-1">Ja</span>
            <span className="absolute -right-1 top-[60%] text-[8px] text-amber-600 font-medium translate-x-full pr-1">Nein</span>
          </>
        )}

        {isSwitch && (
          <>
            {Array.from({ length: switchOutputs }, (_, i) => {
              const pct = switchOutputs === 1 ? 50 : 15 + (i / (switchOutputs - 1)) * 70;
              return (
                <Handle
                  key={`sw-${i}`}
                  id={`switch-${i}`}
                  type="source"
                  position={Position.Right}
                  style={{ top: `${pct}%` }}
                  className={`${HANDLE_CLASS} !bg-violet-500`}
                />
              );
            })}
            {Array.from({ length: switchOutputs }, (_, i) => {
              const pct = switchOutputs === 1 ? 50 : 15 + (i / (switchOutputs - 1)) * 70;
              return (
                <span
                  key={`lbl-${i}`}
                  className="absolute -right-1 text-[7px] text-violet-600 font-medium translate-x-full pr-0.5"
                  style={{ top: `calc(${pct}% - 4px)` }}
                >
                  {i === switchOutputs - 1 ? '↳' : SWITCH_LABELS[i]}
                </span>
              );
            })}
          </>
        )}

        {!isIf && !isSwitch && !isSubNode && (
          <Handle type="source" position={Position.Right} className={`${HANDLE_CLASS} !bg-[#7a7a90]`} />
        )}

        {/* AI-Parent: ein Slot-Handle je Sub-Connection am unteren Rand */}
        {isAiParent && aiSlots.map((s, i) => {
          const pct = aiSlots.length === 1 ? 50 : 15 + (i / (aiSlots.length - 1)) * 70;
          return (
            <Handle
              key={s.slot}
              id={s.slot}
              type="target"
              position={Position.Bottom}
              style={{ left: `${pct}%` }}
              className={`${HANDLE_CLASS} !bg-violet-400`}
            />
          );
        })}
      </button>

      <p
        className={`mt-2 w-full text-center text-[11px] font-medium leading-snug line-clamp-2 pointer-events-none px-0.5 ${disabled ? 'text-gray-400 line-through' : 'text-gray-700'}`}
        style={{ maxWidth: LABEL_MAX_W }}
      >
        {shortLabel(step.label, { n8nType: step.n8nType })}
      </p>

      {/* AI-Parent: Sub-Node-Slots (Chat Model* / Memory / Tool) mit „+" */}
      {isAiParent && (
        <div className="mt-1 flex items-start justify-center gap-2">
          {aiSlots.map(s => {
            const count = subNodeCount(step, s.slot);
            const full = count >= s.max;
            const missing = s.required && count === 0;
            return (
              <div key={s.slot} className="flex flex-col items-center gap-0.5">
                <span className={`text-[8px] font-semibold ${missing ? 'text-red-500' : 'text-violet-500'}`}>
                  {s.label}{s.required ? '*' : ''}{count > 0 ? ` (${count})` : ''}
                </span>
                {interactive && !full && (
                  <button
                    type="button"
                    className="nodrag flex h-4 w-4 items-center justify-center rounded border border-violet-200 bg-white text-violet-500 hover:bg-violet-50"
                    onClick={stop(() => onAddSubNode?.(s.slot))}
                    title={`${s.label} hinzufügen`}
                  >
                    <Plus size={9} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(WorkflowFlowNodeComponent);
