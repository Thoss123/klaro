"use client";

/**
 * Pixel-accurate n8n workflow node — 96×96 white box, icon centered,
 * label below, connection ports, trigger bolt, credential error state.
 */

import React from 'react';
import { AlertCircle, Check, Zap } from 'lucide-react';
import { inferToolFromLabel } from '@/lib/n8n-icon-map';
import { getToolVisual } from './tool-icons';
import N8nNodeIcon from './N8nNodeIcon';

export type N8nNodeState = 'default' | 'configured' | 'needsCredential' | 'selected';

const NODE_SIZE = 96;
const COMPACT_SIZE = 48;

export default function N8nNode({
  tool,
  type,
  n8nType,
  label,
  compact = false,
  state = 'default',
  isTrigger = false,
  showPorts = true,
  onClick,
}: {
  tool?: string | null;
  type?: string | null;
  n8nType?: string | null;
  label: string;
  compact?: boolean;
  state?: N8nNodeState;
  isTrigger?: boolean;
  showPorts?: boolean;
  onClick?: () => void;
}) {
  const size = compact ? COMPACT_SIZE : NODE_SIZE;
  const iconSize = compact ? 22 : 40;
  const resolvedTool = tool || inferToolFromLabel(label) || (n8nType?.split('.').pop());
  const visual = getToolVisual(resolvedTool, type);
  const { color } = visual;

  const borderColor =
    state === 'needsCredential' ? '#ef4444' :
    state === 'configured' ? '#22c55e' :
    state === 'selected' ? color : '#d0d0d8';

  const borderWidth = state === 'needsCredential' || state === 'configured' ? 2 : 1;

  const box = (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {showPorts && !compact && (
        <>
          <span
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white z-10"
            style={{ width: 10, height: 10, border: '2px solid #b0b0bc' }}
          />
          <span
            className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 rounded-full bg-white z-10"
            style={{ width: 10, height: 10, border: '2px solid #b0b0bc' }}
          />
        </>
      )}

      {isTrigger && (
        <div
          className="absolute z-20 flex items-center justify-center rounded-full bg-[#ff6d5a] border-2 border-white"
          style={{
            width: compact ? 14 : 20,
            height: compact ? 14 : 20,
            top: compact ? -4 : -6,
            left: compact ? -4 : -6,
          }}
        >
          <Zap size={compact ? 8 : 11} className="text-white" fill="white" />
        </div>
      )}

      <div
        className="relative flex items-center justify-center bg-white"
        style={{
          width: size,
          height: size,
          borderRadius: compact ? 6 : 8,
          border: `${borderWidth}px solid ${borderColor}`,
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}
      >
        <N8nNodeIcon
          tool={resolvedTool}
          type={type}
          n8nType={n8nType}
          label={label}
          size={iconSize}
          color={color}
        />
      </div>

      {state === 'configured' && (
        <div
          className="absolute z-20 flex items-center justify-center rounded-full bg-green-500 border-2 border-white"
          style={{ width: compact ? 14 : 18, height: compact ? 14 : 18, bottom: compact ? -3 : -4, right: compact ? -3 : -4 }}
        >
          <Check size={compact ? 8 : 11} className="text-white" strokeWidth={3} />
        </div>
      )}

      {state === 'needsCredential' && (
        <div
          className="absolute z-20 flex items-center justify-center rounded-full bg-red-500 border-2 border-white"
          style={{ width: compact ? 14 : 18, height: compact ? 14 : 18, bottom: compact ? -3 : -4, right: compact ? -3 : -4 }}
        >
          <AlertCircle size={compact ? 8 : 11} className="text-white" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );

  const labelEl = (
    <div
      className={`text-center font-medium text-gray-700 leading-tight ${compact ? 'text-[8px] mt-1 max-w-[56px]' : 'text-xs mt-2 max-w-[120px]'}`}
      style={{ lineHeight: 1.25 }}
    >
      {label}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex flex-col items-center shrink-0 focus:outline-none group">
        {box}
        {labelEl}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center shrink-0">
      {box}
      {labelEl}
    </div>
  );
}

export { NODE_SIZE, COMPACT_SIZE };
