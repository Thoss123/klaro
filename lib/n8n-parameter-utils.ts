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

/** Whether a property should be visible given current parameter values. */
export function isPropertyVisible(
  prop: N8nNodeProperty,
  values: Record<string, unknown>,
): boolean {
  const show = prop.displayOptions?.show;
  const hide = prop.displayOptions?.hide;
  if (show && !matchesDisplayRule(show, values)) return false;
  if (hide && matchesDisplayRule(hide, values)) return false;
  return true;
}

/** Flat properties we can render in v1 (skip loadOptions, resourceLocator, etc.). */
export const RENDERABLE_PROPERTY_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'options',
  'multiOptions',
  'json',
  'dateTime',
]);

export function isRenderableProperty(prop: N8nNodeProperty): boolean {
  if (prop.type === 'hidden') return false;
  if (prop.type === 'notice') return false;
  if (prop.type === 'collection' || prop.type === 'fixedCollection') return false;
  if (prop.type === 'loadOptions') return false;
  if (prop.type === 'resourceLocator') return false;
  return RENDERABLE_PROPERTY_TYPES.has(prop.type) || prop.type === 'options';
}

export function getVisibleProperties(
  properties: N8nNodeProperty[],
  values: Record<string, unknown>,
): N8nNodeProperty[] {
  return properties.filter(p => isRenderableProperty(p) && isPropertyVisible(p, values));
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
