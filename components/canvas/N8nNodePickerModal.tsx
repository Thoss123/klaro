"use client";

/**
 * Full-screen n8n node picker — for „Node wechseln“ and „Schritt hinzufügen“.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import type { KlaroN8nCategory } from '@/lib/n8n-categories';
import N8nNodePicker from './N8nNodePicker';
import type { WorkflowStep } from '@/lib/types';

export default function N8nNodePickerModal({
  open,
  title,
  subtitle,
  currentType,
  filterMode = 'all',
  defaultCategory = null,
  slotFilter,
  onClose,
  onSelect,
  onQuickInsert,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  currentType?: string;
  filterMode?: 'all' | 'trigger-only' | 'no-trigger';
  defaultCategory?: KlaroN8nCategory | null;
  slotFilter?: string;
  onClose: () => void;
  onSelect: (entry: N8nCatalogIndexEntry) => void;
  /** IF / Switch / Merge — nur im „Schritt hinzufügen“-Dialog, nicht bei Trigger-Auswahl. */
  onQuickInsert?: (step: WorkflowStep) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="node-picker-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-[4vh_4vw]"
          onClick={onClose}
        >
          <motion.div
            key="node-picker-panel"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-2xl w-full h-full max-w-[960px] max-h-[88dvh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                aria-label="Schließen"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden px-6 py-5 flex flex-col">
              <N8nNodePicker
                expanded
                filterMode={filterMode}
                defaultCategory={defaultCategory}
                slotFilter={slotFilter}
                onQuickInsert={
                  onQuickInsert
                    ? step => {
                        onQuickInsert(step);
                        onClose();
                      }
                    : undefined
                }
                onSelect={entry => {
                  onSelect(entry);
                  onClose();
                }}
                currentType={currentType}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
