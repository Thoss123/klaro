import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCaller } from '@/lib/machine-auth';
import { getOrCreateTable } from '@/lib/data-layer';

/**
 * Datenablage-API — generischer Zeilen-Speicher für n8n-Workflows (Follow-up-Status,
 * Rechnungs-/Mahnwesen-Tracking, Sync-Buchhaltung, ...), ohne dass jeder User Google
 * Sheets o.ä. anbinden muss. Bedient App-UI (Cookie-Session) und n8n (Bearer-Token) —
 * exakt wie /api/agent/pending und /api/workspace.
 *
 * GET  /api/agent/data?project_id=..&table=leads&id=..                    → { rows }
 * GET  /api/agent/data?project_id=..&table=leads&filter={"status":"neu"}  → { rows }
 * POST /api/agent/data  { project_id, table, op, ... }
 *   op=select  { filter?, id?, limit?, order? }              → { rows }
 *   op=insert  { row } | { rows: [...] }  (max 100)           → { rows }
 *   op=update  { id? | filter?, data }                        → { rows }
 *   op=delete  { id? | filter? }  (mind. eins erforderlich)   → { deleted: n }
 *
 * `filter` ist ein flaches Objekt (Top-Level-Key → Wert) und wird per JSONB-Containment
 * (`data @> filter`) gematcht — reicht für die üblichen n8n-Anwendungsfälle (Lead-ID,
 * Status, Rechnungsnummer, ...).
 */

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const MAX_INSERT_ROWS = 100;

type Filter = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseFilter(raw: unknown): { filter?: Filter; error?: string } {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) return { error: 'filter must be an object' };
  return { filter: raw };
}

async function runSelect(
  supabase: SupabaseClient,
  tableId: string,
  opts: { id?: string; filter?: Filter; limit?: number; order?: 'asc' | 'desc' },
) {
  let query = supabase.from('user_data_rows').select('*').eq('table_id', tableId);
  if (opts.id) query = query.eq('id', opts.id);
  if (opts.filter && Object.keys(opts.filter).length > 0) query = query.contains('data', opts.filter);

  const ascending = opts.order !== 'desc';
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  query = query.order('created_at', { ascending }).limit(limit);

  const { data, error } = await query;
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id');
  const caller = await resolveCaller(req, projectId);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 });

  const tableName = req.nextUrl.searchParams.get('table');
  if (!tableName) return NextResponse.json({ error: 'table required' }, { status: 400 });

  const table = await getOrCreateTable(caller.supabase, caller.userId, projectId, tableName);
  if (!table) return NextResponse.json({ error: 'table resolution failed' }, { status: 500 });

  const rawFilter = req.nextUrl.searchParams.get('filter');
  let filter: Filter | undefined;
  if (rawFilter) {
    const parsed = parseFilter(JSON.parse(rawFilter));
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    filter = parsed.filter;
  }

  const id = req.nextUrl.searchParams.get('id') ?? undefined;
  const limitParam = req.nextUrl.searchParams.get('limit');
  const order = req.nextUrl.searchParams.get('order') === 'desc' ? 'desc' : 'asc';

  const result = await runSelect(caller.supabase, table.id, {
    id,
    filter,
    limit: limitParam ? Number(limitParam) : undefined,
    order,
  });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ rows: result.rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    project_id: projectId,
    table: tableName,
    op,
    id,
    filter: rawFilter,
    limit,
    order,
    row,
    rows,
    data,
  } = body as {
    project_id?: string;
    table?: string;
    op?: string;
    id?: string;
    filter?: unknown;
    limit?: number;
    order?: 'asc' | 'desc';
    row?: unknown;
    rows?: unknown;
    data?: unknown;
  };

  const caller = await resolveCaller(req, projectId ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!projectId || !tableName) {
    return NextResponse.json({ error: 'project_id, table required' }, { status: 400 });
  }
  if (op !== 'select' && op !== 'insert' && op !== 'update' && op !== 'delete') {
    return NextResponse.json({ error: 'op must be one of: select, insert, update, delete' }, { status: 400 });
  }

  const table = await getOrCreateTable(caller.supabase, caller.userId, projectId, tableName);
  if (!table) return NextResponse.json({ error: 'table resolution failed' }, { status: 500 });

  const parsedFilter = parseFilter(rawFilter);
  if (parsedFilter.error) return NextResponse.json({ error: parsedFilter.error }, { status: 400 });
  const filter = parsedFilter.filter;

  if (op === 'select') {
    const result = await runSelect(caller.supabase, table.id, { id, filter, limit, order });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ rows: result.rows });
  }

  if (op === 'insert') {
    if (row === undefined && rows === undefined) {
      return NextResponse.json({ error: 'row or rows required' }, { status: 400 });
    }
    const inputRows = rows !== undefined ? rows : [row];
    if (!Array.isArray(inputRows) || inputRows.length === 0) {
      return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 });
    }
    if (inputRows.length > MAX_INSERT_ROWS) {
      return NextResponse.json({ error: `rows exceeds max of ${MAX_INSERT_ROWS}` }, { status: 400 });
    }
    if (!inputRows.every(isPlainObject)) {
      return NextResponse.json({ error: 'each row must be an object' }, { status: 400 });
    }

    const payload = inputRows.map((r) => ({
      table_id: table.id,
      user_id: caller.userId,
      project_id: projectId,
      data: r,
    }));
    const { data: inserted, error } = await caller.supabase.from('user_data_rows').insert(payload).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: inserted ?? [] });
  }

  if (op === 'update') {
    if (!id && (!filter || Object.keys(filter).length === 0)) {
      return NextResponse.json({ error: 'id or filter required' }, { status: 400 });
    }
    if (!isPlainObject(data)) {
      return NextResponse.json({ error: 'data must be an object' }, { status: 400 });
    }

    // Merge statt Überschreiben: bestehende Keys bleiben erhalten, sofern nicht überschrieben.
    let selectQuery = caller.supabase.from('user_data_rows').select('id, data').eq('table_id', table.id);
    if (id) selectQuery = selectQuery.eq('id', id);
    if (filter && Object.keys(filter).length > 0) selectQuery = selectQuery.contains('data', filter);
    const { data: targets, error: selectError } = await selectQuery;
    if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 });
    if (!targets || targets.length === 0) return NextResponse.json({ rows: [] });

    const updated: unknown[] = [];
    for (const target of targets as Array<{ id: string; data: Record<string, unknown> }>) {
      const merged = { ...target.data, ...data };
      const { data: row, error } = await caller.supabase
        .from('user_data_rows')
        .update({ data: merged, updated_at: new Date().toISOString() })
        .eq('id', target.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      updated.push(row);
    }
    return NextResponse.json({ rows: updated });
  }

  // op === 'delete'
  if (!id && (!filter || Object.keys(filter).length === 0)) {
    return NextResponse.json({ error: 'id or filter required (delete-all is not allowed)' }, { status: 400 });
  }

  let deleteQuery = caller.supabase.from('user_data_rows').delete().eq('table_id', table.id);
  if (id) deleteQuery = deleteQuery.eq('id', id);
  if (filter && Object.keys(filter).length > 0) deleteQuery = deleteQuery.contains('data', filter);
  const { data: deleted, error } = await deleteQuery.select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: deleted?.length ?? 0 });
}
