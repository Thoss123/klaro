/**
 * Types for n8n editor catalog assets (/types/nodes.json, credentials.json).
 */

export interface N8nPropertyOption {
  name: string;
  value: string | number | boolean;
  description?: string;
  action?: string;
}

export interface N8nNodeProperty {
  displayName: string;
  name: string;
  type: string;
  default?: unknown;
  description?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: N8nPropertyOption[];
  displayOptions?: {
    show?: Record<string, unknown[]>;
    hide?: Record<string, unknown[]>;
  };
  typeOptions?: Record<string, unknown>;
  noDataExpression?: boolean;
}

export interface N8nCredentialRef {
  name: string;
  required?: boolean;
  displayOptions?: {
    show?: Record<string, unknown[]>;
    hide?: Record<string, unknown[]>;
  };
}

export interface N8nNodeTypeDescription {
  name: string;
  displayName: string;
  description?: string;
  version: number | number[];
  defaults?: { name: string };
  inputs?: string[];
  outputs?: string[];
  properties: N8nNodeProperty[];
  credentials?: N8nCredentialRef[];
  group?: string[];
  /** Legacy n8n editor icon ref (file:… or fa:…) */
  icon?: string | { light: string; dark: string };
  /** Current nodes.json icon path, e.g. icons/n8n-nodes-base/dist/nodes/Gmail/gmail.svg */
  iconUrl?: string | { light: string; dark: string };
  codex?: {
    categories?: string[];
    alias?: string[];
    subcategories?: Record<string, string[]>;
  };
  subtitle?: string;
}

export interface N8nCredentialProperty {
  displayName: string;
  name: string;
  type: string;
  default?: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: N8nPropertyOption[];
}

export interface N8nCredentialTypeDescription {
  name: string;
  displayName: string;
  documentationUrl?: string;
  properties: N8nCredentialProperty[];
  icon?: string | { light: string; dark: string };
}

export interface N8nCatalogSnapshot {
  nodes: N8nNodeTypeDescription[];
  credentials: N8nCredentialTypeDescription[];
  fetchedAt: string;
  source: 'live' | 'bundled' | 'mock';
}

export interface N8nCatalogIndexEntry {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  groups: string[];
  categories: string[];
  aliases: string[];
  hasCredentials: boolean;
  credentialTypes: string[];
  iconPath: string | null;
  klaroCategory: string;
}

export interface NodeResolverResult {
  step_id: string;
  n8n_type: string;
  type_version: number;
  parameters: Record<string, unknown>;
  credential_type?: string;
  display_name?: string;
}
