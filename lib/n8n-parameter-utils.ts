/**
 * Helpers for rendering n8n node properties (displayOptions, defaults).
 */

import type { N8nNodeProperty } from './n8n-catalog-types';

function matchesDisplayRule(
  rule: Record<string, unknown[]>,
  values: Record<string, unknown>,
): boolean {
  for (const [key, allowed] of Object.entries(rule)) {
    const current = values[key];
    const allowedStr = allowed.map(v => String(v));
    if (!allowedStr.includes(String(current))) return false;
  }
  return true;
}

export function isPropertyVisible(
  prop: N8nNodeProperty,
  values: Record<string, unknown>,
): boolean {
  if (prop.name === 'jsCode' || prop.name === 'pythonCode' || prop.name === 'code') return true;
  // Wir verwalten Credentials (und damit den Auth-Typ) über unsere eigene Credential-UI.
  // Das n8n "authentication" Property soll daher nicht als normales Feld im Formular auftauchen.
  if (prop.name === 'authentication') return false;

  const show = prop.displayOptions?.show;
  const hide = prop.displayOptions?.hide;
  if (show && !matchesDisplayRule(show, values)) return false;
  if (hide && matchesDisplayRule(hide, values)) return false;
  return true;
}

export const RENDERABLE_PROPERTY_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'options',
  'multiOptions',
  'json',
  'dateTime',
  'collection',
  'fixedCollection',
  // Airtable Base/Table u. ä. — ohne dieses Feld ist der Node nicht konfigurierbar.
  'resourceLocator',
]);

export function isRenderableProperty(prop: N8nNodeProperty): boolean {
  if (prop.type === 'hidden') return false;
  if (prop.type === 'notice') return false;
  if (prop.type === 'loadOptions') return false;
  return RENDERABLE_PROPERTY_TYPES.has(prop.type) || prop.type === 'options';
}

export function getVisibleProperties(
  properties: N8nNodeProperty[],
  values: Record<string, unknown>,
): N8nNodeProperty[] {
  return properties.filter(p => isRenderableProperty(p) && isPropertyVisible(p, values));
}

/**
 * Ein Feld ist „kritisch", wenn der Node ohne es nicht läuft: required ODER ein
 * resourceLocator (Airtable Base/Table, Sheets-Dokument, Slack-Channel …), der
 * vom Nutzer/Tool gewählt werden muss.
 */
export function isCrucialProperty(prop: N8nNodeProperty): boolean {
  return prop.required === true || prop.type === 'resourceLocator';
}

/** Wert leer? — inkl. resourceLocator-Objekt mit leerem `.value`. */
export function isEmptyParamValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'object' && value !== null && 'value' in (value as Record<string, unknown>)) {
    const v = (value as { value?: unknown }).value;
    return v === undefined || v === null || v === '';
  }
  return false;
}

/**
 * Sichtbare, kritische Pflichtfelder, die (für die aktuell gewählte Operation) noch leer sind.
 * resourceLocator-Felder sind tool-abhängig → müssen per Live-Optionen gewählt werden.
 */
export function missingCrucialParams(
  properties: N8nNodeProperty[],
  values: Record<string, unknown>,
): N8nNodeProperty[] {
  return getVisibleProperties(properties, values)
    .filter(isCrucialProperty)
    .filter(p => isEmptyParamValue(values[p.name]));
}

export function buildInitialParameters(
  properties: N8nNodeProperty[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const prop of properties) {
    if (prop.default !== undefined) values[prop.name] = prop.default;
  }
  return values;
}

export function mergeParameters(
  properties: N8nNodeProperty[],
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  const base = buildInitialParameters(properties);
  if (!existing) return base;
  return { ...base, ...existing };
}

export function iconUrlFromRef(
  icon: string | { light: string; dark: string } | undefined,
): string | null {
  if (!icon) return null;
  if (typeof icon === 'string') {
    const path = icon.replace(/^icons\//, '').replace(/^file:/, '');
    if (path.startsWith('fa:')) return null;
    return `/api/n8n/icon?path=${encodeURIComponent(path)}`;
  }
  const path = icon.light?.replace(/^icons\//, '').replace(/^file:/, '');
  if (!path) return null;
  return `/api/n8n/icon?path=${encodeURIComponent(path)}`;
}
