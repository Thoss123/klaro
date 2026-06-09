"use client";

/**
 * Trailing „+“-Connector nach dem letzten Node — n8n-Stil.
 */

import React, { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';

export type AddStepNodeData = {
  onClick?: () => void;
};

const BTN_SIZE = 28;

function WorkflowAddStepNodeComponent({ data }: NodeProps<Node<AddStepNodeData>>) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); data.onClick?.(); }}
      className="nodrag nopan pointer-events-auto flex items-center justify-center rounded-md border border-[#c8c8d4] bg-white text-[#8888a0] shadow-sm transition-colors hover:border-indigo-400 hover:bg-indigo-50/60 hover:text-indigo-600"
      style={{ width: BTN_SIZE, height: BTN_SIZE }}
      aria-label="Schritt hinzufügen"
      title="Schritt hinzufügen"
    >
      <Plus size={14} strokeWidth={2} />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-0 !h-0 !min-w-0 !min-h-0 !border-0 !bg-transparent !opacity-0"
        style={{ left: 0, top: '50%' }}
      />
    </button>
  );
}

export default memo(WorkflowAddStepNodeComponent);

export { BTN_SIZE as ADD_STEP_BTN_SIZE };
