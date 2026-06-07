"use client";

/**
 * Shared n8n-style workflow node graph on dotted canvas.
 */

import React from 'react';
import { WorkflowStep, StepConfig } from '@/lib/types';
import { isConfigured, requiresConfig } from '@/lib/workflow-deploy';
import N8nNode, { COMPACT_SIZE, NODE_SIZE, type N8nNodeState } from './N8nNode';

function nodeState(step: WorkflowStep, stepConfigs?: Record<string, StepConfig>): N8nNodeState {
  if (!stepConfigs) return 'default';
  const needs = requiresConfig(step);
  const configured = isConfigured(step, stepConfigs[step.id]);
  if (configured) return 'configured';
  if (needs) return 'needsCredential';
  return 'default';
}

export default function WorkflowNodeGraph({
  steps,
  compact = false,
  interactive = false,
  stepConfigs,
  onStepClick,
  onAddStepClick,
  showTrailingPlus = true,
  selectedStepId,
  className = '',
}: {
  steps: WorkflowStep[];
  compact?: boolean;
  interactive?: boolean;
  stepConfigs?: Record<string, StepConfig>;
  onStepClick?: (step: WorkflowStep) => void;
  onAddStepClick?: () => void;
  showTrailingPlus?: boolean;
  selectedStepId?: string | null;
  className?: string;
}) {
  const nodeSize = compact ? COMPACT_SIZE : NODE_SIZE;
  const connectorW = compact ? 20 : 48;
  const colW = compact ? 64 : 130;

  const graph = (
    <div className={`flex items-start min-w-max ${compact ? 'px-2 py-2' : 'px-16 py-16 mx-auto'}`}>
      {steps.map((step, i) => {
        const state = nodeState(step, stepConfigs);
        const isSelected = selectedStepId === step.id;
        const displayState: N8nNodeState = isSelected ? 'selected' : state;

        return (
          <React.Fragment key={step.id || i}>
            {i > 0 && (
              <div
                className="flex items-center shrink-0 self-start"
                style={{ width: connectorW, marginTop: nodeSize / 2 - 1 }}
              >
                <div className="h-[2px] w-full bg-[#b0b0bc]" />
              </div>
            )}

            <div className="flex flex-col items-center shrink-0" style={{ width: colW }}>
              <N8nNode
                tool={step.tool || step.n8nType?.split('.').pop()}
                type={step.type}
                n8nType={step.n8nType || stepConfigs?.[step.id]?.n8nType}
                label={step.label}
                compact={compact}
                state={displayState}
                isTrigger={step.type === 'trigger'}
                showPorts={!compact}
                onClick={interactive && onStepClick ? () => onStepClick(step) : undefined}
              />
            </div>
          </React.Fragment>
        );
      })}

      {showTrailingPlus && !compact && (
        <>
          <div
            className="flex items-center shrink-0 self-start"
            style={{ width: 32, marginTop: NODE_SIZE / 2 - 1 }}
          >
            <div className="h-[2px] w-full bg-[#b0b0bc]" />
          </div>
          <button
            type="button"
            onClick={onAddStepClick}
            disabled={!onAddStepClick}
            className="flex items-center justify-center shrink-0 border border-dashed border-[#b0b0bc] rounded-md text-[#8888a0] text-lg font-light hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors disabled:cursor-default disabled:hover:border-[#b0b0bc] disabled:hover:text-[#8888a0] disabled:hover:bg-transparent"
            style={{ width: 28, height: 28, marginTop: NODE_SIZE / 2 - 14 }}
            aria-label="Schritt hinzufügen"
            title="Schritt hinzufügen"
          >
            +
          </button>
        </>
      )}
    </div>
  );

  const canvasStyle = {
    backgroundImage: 'radial-gradient(#c8c8d4 1px, transparent 1px)',
    backgroundSize: compact ? '14px 14px' : '20px 20px',
    backgroundColor: '#f7f7fa',
  };

  if (compact) {
    return (
      <div className={`overflow-x-auto rounded-lg border border-gray-100 ${className}`} style={canvasStyle}>
        {graph}
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-auto min-h-0 ${className}`} style={canvasStyle}>
      {graph}
    </div>
  );
}
