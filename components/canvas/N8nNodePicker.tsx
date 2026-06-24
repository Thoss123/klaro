"use client";

/**
 * n8n-style node picker — Kategorien (Was passiert als Nächstes?) + Suche + Drill-down.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Bot,
  Globe,
  Pencil,
  GitBranch,
  Briefcase,
  BadgeCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import {
  pickerCategoriesForMode,
  stepTypeFromCatalogEntry,
  type AxantiloN8nCategory,
  type AxantiloN8nCategoryMeta,
} from '@/lib/n8n-categories';
import { slotCandidates } from '@/lib/ai-subnodes';
import type { WorkflowStep } from '@/lib/types';
import FlowNodeShortcuts from './FlowNodeShortcuts';
import N8nNodeIcon from './N8nNodeIcon';
import { getToolVisual } from './tool-icons';

const CATEGORY_ICONS: Record<AxantiloN8nCategory, LucideIcon> = {
  ai: Bot,
  action: Globe,
  data: Pencil,
  flow: GitBranch,
  core: Briefcase,
  human: BadgeCheck,
  trigger: Zap,
};

function NodeRow({
  entry,
  expanded,
  currentType,
  onSelect,
}: {
  entry: N8nCatalogIndexEntry;
  expanded: boolean;
  currentType?: string;
  onSelect: (entry: N8nCatalogIndexEntry) => void;
}) {
  const type = stepTypeFromCatalogEntry(entry);
  const { color } = getToolVisual(undefined, type);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={`w-full text-left hover:bg-indigo-50/50 transition-colors flex items-center gap-3 ${
        expanded ? 'px-4 py-3.5' : 'px-3 py-2.5'
      } ${currentType === entry.name ? 'bg-indigo-50' : ''}`}
    >
      <div className={`shrink-0 flex items-center justify-center ${expanded ? 'w-8 h-8' : 'w-6 h-6'}`}>
        <N8nNodeIcon
          n8nType={entry.name}
          label={entry.displayName}
          type={type}
          size={expanded ? 32 : 24}
          color={color}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-medium text-gray-800 truncate ${expanded ? 'text-base' : 'text-sm'}`}>
          {entry.displayName}
        </div>
        <div className={`text-gray-400 truncate ${expanded ? 'text-xs' : 'text-[10px]'}`}>
          {entry.description || entry.name}
        </div>
      </div>
    </button>
  );
}

function CategoryRow({
  cat,
  onSelect,
}: {
  cat: AxantiloN8nCategoryMeta;
  onSelect: (id: AxantiloN8nCategory) => void;
}) {
  const Icon = CATEGORY_ICONS[cat.id];
  return (
    <button
      type="button"
      onClick={() => onSelect(cat.id)}
      className="w-full text-left flex items-start gap-4 px-4 py-4 hover:bg-indigo-50/40 transition-colors border-b border-gray-50 last:border-0 group"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors">
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="font-semibold text-gray-900 text-base">{cat.label}</div>
        <div className="text-sm text-gray-500 mt-0.5 leading-snug">{cat.pickerDescription}</div>
      </div>
      <ChevronRight size={20} className="text-gray-300 shrink-0 mt-2 group-hover:text-indigo-400" />
    </button>
  );
}

export default function N8nNodePicker({
  onSelect,
  currentType,
  expanded = false,
  filterMode = 'all',
  defaultCategory = null,
  slotFilter,
  onQuickInsert,
}: {
  onSelect: (entry: N8nCatalogIndexEntry) => void;
  currentType?: string;
  expanded?: boolean;
  /** trigger-only = Schritt 1; no-trigger = Mitte/Ende */
  filterMode?: 'all' | 'trigger-only' | 'no-trigger';
  defaultCategory?: AxantiloN8nCategory | null;
  /** AI-Sub-Node-Slot (ai_languageModel / ai_memory / ai_tool) */
  slotFilter?: string;
  onQuickInsert?: (step: WorkflowStep) => void;
}) {
  const categories = useMemo(() => pickerCategoriesForMode(filterMode), [filterMode]);
  const [browseCategory, setBrowseCategory] = useState<AxantiloN8nCategory | null>(
    filterMode === 'trigger-only' ? 'trigger' : defaultCategory,
  );
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<N8nCatalogIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchSource, setSearchSource] = useState<'local' | 'mcp' | 'merged' | null>(null);

  const activeCategory = browseCategory ?? defaultCategory;
  const isSearching = query.trim().length > 0;
  const showCategoryHome = expanded && !isSearching && browseCategory === null;
  const showDrillDown = expanded && !isSearching && browseCategory !== null;
  const activeCategoryMeta = categories.find(c => c.id === browseCategory);

  const loadEntries = useCallback(async (cat: AxantiloN8nCategory | null, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ index: '1' });
      if (cat) params.set('category', cat);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/n8n/catalog?${params}`);
      if (!res.ok) throw new Error('Catalog load failed');
      const data = await res.json() as {
        index?: N8nCatalogIndexEntry[];
        searchSource?: 'local' | 'mcp' | 'merged';
      };
      let list: N8nCatalogIndexEntry[] = data.index || [];
      setSearchSource(q.trim() ? (data.searchSource ?? 'local') : null);
      if (filterMode === 'trigger-only') {
        list = list.filter(e => e.axantiloCategory === 'trigger');
      } else if (filterMode === 'no-trigger') {
        list = list.filter(e => e.axantiloCategory !== 'trigger');
      }
      if (slotFilter) {
        const allowed = new Set(slotCandidates(slotFilter, list).map(e => e.name));
        list = list.filter(e => allowed.has(e.name));
      }
      setEntries(list);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filterMode, slotFilter]);

  // Reset the active category + query whenever the picker's filter context changes —
  // adjust during render instead of in an effect to avoid the setState-in-effect cascade.
  const filterKey = `${defaultCategory}|${filterMode}|${slotFilter ?? ''}`;
  const [syncedFilterKey, setSyncedFilterKey] = useState(filterKey);
  if (filterKey !== syncedFilterKey) {
    setSyncedFilterKey(filterKey);
    setBrowseCategory(slotFilter ? 'ai' : filterMode === 'trigger-only' ? 'trigger' : defaultCategory);
    setQuery('');
  }

  useEffect(() => {
    // All state updates happen inside the timeout callback (async), keeping this effect
    // out of the synchronous setState-in-effect cascade.
    const cat = isSearching ? null : (browseCategory ?? defaultCategory);
    const t = setTimeout(() => {
      if (showCategoryHome) {
        setEntries([]);
        setLoading(false);
        return;
      }
      loadEntries(cat, query);
    }, isSearching ? 200 : 0);
    return () => clearTimeout(t);
  }, [browseCategory, defaultCategory, query, loadEntries, showCategoryHome, isSearching]);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (value.trim()) setBrowseCategory(null);
  };

  const handleFlowQuickInsert = (step: WorkflowStep) => {
    onQuickInsert?.(step);
  };

  return (
    <div className={`flex flex-col ${expanded ? 'h-full min-h-0' : ''} gap-3`}>
      <div className="relative shrink-0">
        <Search size={expanded ? 18 : 14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Nodes suchen… (Gmail, OpenAI, Slack, …)"
          className={`w-full pl-10 pr-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
            expanded ? 'py-3 text-base' : 'py-2 text-sm'
          }`}
        />
      </div>

      {isSearching && searchSource && searchSource !== 'local' && (
        <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 shrink-0">
          Zusätzliche Treffer live von deiner n8n-Instanz (MCP).
        </p>
      )}

      {!isSearching && filterMode === 'trigger-only' && (
        <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 shrink-0">
          Der erste Schritt muss ein Trigger sein (Manual, Webhook, Schedule, …).
        </p>
      )}

      {!isSearching && filterMode === 'no-trigger' && showCategoryHome && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 shrink-0">
          Wähle eine Kategorie — Trigger sind nur am Workflow-Anfang möglich.
        </p>
      )}

      {showDrillDown && filterMode !== 'trigger-only' && (
        <button
          type="button"
          onClick={() => setBrowseCategory(null)}
          className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 shrink-0 w-fit"
        >
          <ChevronLeft size={16} />
          Alle Kategorien
        </button>
      )}

      {showDrillDown && activeCategoryMeta && (
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0 -mt-1">
          {activeCategoryMeta.label}
        </p>
      )}

      {!expanded && !isSearching && (
        <div className="flex flex-wrap gap-2 shrink-0">
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setBrowseCategory(c => (c === cat.id ? null : cat.id))}
              className={`px-3 py-1.5 rounded-full border text-[11px] transition-colors ${
                activeCategory === cat.id
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      <div
        className={`overflow-y-auto border border-gray-100 rounded-xl flex-1 min-h-0 divide-y divide-gray-50 ${
          expanded ? '' : 'max-h-[280px]'
        }`}
      >
        {showCategoryHome ? (
          categories.map(cat => (
            <CategoryRow key={cat.id} cat={cat} onSelect={setBrowseCategory} />
          ))
        ) : loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : (
          <>
            {showDrillDown && browseCategory === 'flow' && onQuickInsert && (
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Schnell hinzufügen
                </p>
                <FlowNodeShortcuts onInsert={handleFlowQuickInsert} />
              </div>
            )}
            {entries.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Keine Nodes gefunden.</p>
            ) : (
              <>
                {(isSearching || !expanded) && (
                  <p className="text-[10px] text-gray-400 px-3 py-1 border-b border-gray-50">
                    {entries.length} {entries.length === 1 ? 'Node' : 'Nodes'}
                    {isSearching ? ' · Suche' : activeCategoryMeta ? ` · ${activeCategoryMeta.label}` : ''}
                  </p>
                )}
                {entries.map(entry => (
                  <NodeRow
                    key={`${entry.name}@${entry.version}`}
                    entry={entry}
                    expanded={expanded}
                    currentType={currentType}
                    onSelect={onSelect}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
