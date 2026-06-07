"use client";

/**
 * Generic n8n parameter form — renders properties[] from nodes.json.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { N8nCredentialTypeDescription, N8nNodeProperty, N8nNodeTypeDescription, N8nPropertyOption } from '@/lib/n8n-catalog-types';
import { dedupePropertyOptions, hasLoadOptions, resolveStaticOptions } from '@/lib/n8n-static-options';
import {
  getVisibleProperties,
  mergeParameters,
  iconUrlFromRef,
} from '@/lib/n8n-parameter-utils';

function usePropertyOptions(
  nodeType: string,
  prop: N8nNodeProperty,
  parameters: Record<string, unknown>,
): N8nPropertyOption[] {
  const [dynamic, setDynamic] = useState<N8nPropertyOption[]>([]);

  const staticOpts = useMemo(
    () => (prop.options?.length ? prop.options : resolveStaticOptions(nodeType, prop.name)),
    [nodeType, prop.name, prop.options],
  );

  const needsFetch = hasLoadOptions(prop);

  const fetchOptions = useCallback(async () => {
    if (!needsFetch) return;
    try {
      const res = await fetch('/api/n8n/load-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeType, propertyName: prop.name, parameters }),
      });
      if (res.ok) {
        const data = await res.json() as { options?: N8nPropertyOption[] };
        if (data.options?.length) {
          setDynamic(data.options);
          return;
        }
      }
    } catch { /* static fallback */ }
    setDynamic(staticOpts);
  }, [needsFetch, nodeType, prop.name, parameters, staticOpts]);

  useEffect(() => {
    if (prop.options?.length) {
      setDynamic([]);
      return;
    }
    if (needsFetch) fetchOptions();
    else setDynamic(staticOpts);
  }, [prop.options, needsFetch, fetchOptions, staticOpts]);

  if (prop.options?.length) return dedupePropertyOptions(prop.options);
  if (dynamic.length) return dedupePropertyOptions(dynamic);
  return dedupePropertyOptions(staticOpts);
}

function OptionsField({
  nodeType,
  prop,
  value,
  parameters,
  onChange,
}: {
  nodeType: string;
  prop: N8nNodeProperty;
  value: unknown;
  parameters: Record<string, unknown>;
  onChange: (v: string) => void;
}) {
  const options = usePropertyOptions(nodeType, prop, parameters);
  const current = String(value ?? prop.default ?? '');

  if (!options.length) {
    return (
      <input
        type="text"
        value={current}
        placeholder={prop.placeholder || `${prop.displayName} eingeben…`}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    );
  }

  const inList = options.some(o => String(o.value) === current);
  const selectValue = inList ? current : String(options[0]?.value ?? current);

  return (
    <select
      value={selectValue}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      {!inList && current && (
        <option value={current}>{current} (aktuell)</option>
      )}
      {options.map(o => (
        <option key={String(o.value)} value={String(o.value)}>{o.name}</option>
      ))}
    </select>
  );
}

export interface N8nParameterFormValue {
  n8nType: string;
  n8nTypeVersion: number;
  parameters: Record<string, unknown>;
  credentialType?: string;
  credentialValue?: string;
}

export default function N8nParameterForm({
  node,
  credential,
  existing,
  onChange,
}: {
  node: N8nNodeTypeDescription;
  credential?: N8nCredentialTypeDescription | null;
  existing?: Partial<N8nParameterFormValue>;
  onChange?: (value: N8nParameterFormValue) => void;
}) {
  const [parameters, setParameters] = useState<Record<string, unknown>>(() =>
    mergeParameters(node.properties || [], existing?.parameters),
  );
  const [credentialValue, setCredentialValue] = useState(existing?.credentialValue ?? '');

  const credentialType = node.credentials?.[0]?.name;
  const visible = useMemo(
    () => getVisibleProperties(node.properties || [], parameters),
    [node.properties, parameters],
  );

  useEffect(() => {
    onChange?.({
      n8nType: node.name,
      n8nTypeVersion: Array.isArray(node.version) ? node.version[node.version.length - 1] : (node.version ?? 1),
      parameters,
      credentialType,
      credentialValue: credentialValue || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is stable enough; avoid loop
  }, [parameters, credentialValue, node.name, node.version, credentialType]);

  const setParam = (name: string, value: unknown) => {
    setParameters(prev => ({ ...prev, [name]: value }));
  };

  const iconUrl = iconUrlFromRef(
    node.iconUrl
      ?? (typeof node.icon === 'string' ? node.icon : node.icon?.light),
  );

  return (
    <div className="space-y-4">
      {node.description && (
        <p className="text-xs text-gray-500 leading-relaxed">{node.description}</p>
      )}

      {visible.map(prop => (
        <div key={prop.name}>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
            {prop.displayName}{prop.required ? ' *' : ''}
          </label>

          {prop.type === 'options' && (
            <OptionsField
              nodeType={node.name}
              prop={prop}
              value={parameters[prop.name]}
              parameters={parameters}
              onChange={v => setParam(prop.name, v)}
            />
          )}

          {prop.type === 'multiOptions' && (
            <select
              multiple
              value={Array.isArray(parameters[prop.name]) ? (parameters[prop.name] as string[]).map(String) : []}
              onChange={e => {
                const selected = Array.from(e.target.selectedOptions).map(o => o.value);
                setParam(prop.name, selected);
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 min-h-[80px]"
            >
              {(prop.options || []).map(o => (
                <option key={String(o.value)} value={String(o.value)}>{o.name}</option>
              ))}
            </select>
          )}

          {prop.type === 'boolean' && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(parameters[prop.name])}
                onChange={e => setParam(prop.name, e.target.checked)}
                className="rounded border-gray-300"
              />
              {prop.displayName}
            </label>
          )}

          {prop.type === 'number' && (
            <input
              type="number"
              value={parameters[prop.name] != null ? String(parameters[prop.name]) : ''}
              placeholder={prop.placeholder}
              onChange={e => setParam(prop.name, e.target.value === '' ? undefined : Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}

          {(prop.type === 'string' || prop.type === 'json' || prop.type === 'dateTime') && (
            prop.type === 'json' || (prop.typeOptions as { rows?: number } | undefined)?.rows ? (
              <textarea
                rows={4}
                value={String(parameters[prop.name] ?? '')}
                placeholder={prop.placeholder}
                onChange={e => setParam(prop.name, e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            ) : (
              <input
                type="text"
                value={String(parameters[prop.name] ?? '')}
                placeholder={prop.placeholder}
                onChange={e => setParam(prop.name, e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )
          )}

          {(prop.hint || prop.description) && (
            <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">{prop.hint || prop.description}</p>
          )}
        </div>
      ))}

      {credentialType && (
        <div className="pt-2 border-t border-gray-100">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
            {credential?.displayName || credentialType} *
          </label>
          <input
            type="password"
            value={credentialValue}
            onChange={e => setCredentialValue(e.target.value)}
            placeholder={credential?.properties?.[0]?.placeholder || 'API Key / Access Token…'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <p className="mt-1.5 text-[11px] text-gray-400">
            Wird verschlüsselt gespeichert und erst beim Deploy an n8n übergeben.
          </p>
          {credential?.documentationUrl && (
            <a
              href={credential.documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs text-indigo-600 hover:text-indigo-800"
            >
              Credential-Dokumentation (n8n)
            </a>
          )}
        </div>
      )}

      {iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className="hidden" aria-hidden />
      )}
    </div>
  );
}
