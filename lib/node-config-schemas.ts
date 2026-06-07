/**
 * @deprecated Use n8n catalog (/api/n8n/catalog) + N8nParameterForm instead.
 * Kept for backward compatibility with legacy StepConfigModal paths.
 */

import type { StepConfigType } from './types';

export type FieldType = 'text' | 'password' | 'textarea' | 'select' | 'number' | 'readonly' | 'presets';

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  presets?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  rows?: number;
}

/** @deprecated — use n8n credentials.json via catalog API */
export function getFieldsForConfigType(
  _configType: StepConfigType,
  _tool?: string,
  _provider?: string,
): ConfigField[] {
  return [];
}

/** @deprecated */
export function getProviderHelpUrl(_provider?: string, _configType?: StepConfigType): string | undefined {
  return undefined;
}
