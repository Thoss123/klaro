/**
 * Minimal n8n catalog for MOCK_N8N / offline dev — mirrors real nodes.json shape.
 */

import type { N8nCatalogSnapshot, N8nCredentialTypeDescription, N8nNodeTypeDescription } from './n8n-catalog-types';

const MOCK_NODES: N8nNodeTypeDescription[] = [
  {
    name: 'n8n-nodes-base.manualTrigger',
    displayName: 'Manual Trigger',
    group: ['trigger'],
    version: 1,
    properties: [],
    icon: 'fa:mouse-pointer',
  },
  {
    name: 'n8n-nodes-base.scheduleTrigger',
    displayName: 'Schedule Trigger',
    group: ['trigger', 'schedule'],
    version: 1,
    properties: [
      {
        displayName: 'Trigger Times',
        name: 'rule',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
      },
    ],
    icon: 'fa:clock',
  },
  {
    name: 'n8n-nodes-base.webhook',
    displayName: 'Webhook',
    group: ['trigger'],
    version: 2,
    properties: [
      {
        displayName: 'HTTP Method',
        name: 'httpMethod',
        type: 'options',
        default: 'POST',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
        ],
      },
      { displayName: 'Path', name: 'path', type: 'string', default: '' },
    ],
    icon: 'fa:link',
  },
  {
    name: '@n8n/n8n-nodes-langchain.openAi',
    displayName: 'OpenAI',
    group: ['transform'],
    version: 1,
    codex: { categories: ['AI'], alias: ['ChatGPT', 'GPT'] },
    credentials: [{ name: 'openAiApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        default: 'text',
        options: [
          { name: 'Text', value: 'text' },
          { name: 'Image', value: 'image' },
        ],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'message',
        displayOptions: { show: { resource: ['text'] } },
        options: [
          { name: 'Message', value: 'message' },
          { name: 'Classify', value: 'classify' },
        ],
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        default: 'gpt-4o-mini',
        displayOptions: { show: { resource: ['text'], operation: ['message'] } },
        options: [
          { name: 'GPT-4o mini', value: 'gpt-4o-mini' },
          { name: 'GPT-4o', value: 'gpt-4o' },
        ],
      },
      {
        displayName: 'System Message',
        name: 'systemMessage',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['text'], operation: ['message'] } },
      },
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['text'], operation: ['message'] } },
      },
      {
        displayName: 'Temperature',
        name: 'temperature',
        type: 'number',
        default: 0.7,
        displayOptions: { show: { resource: ['text'], operation: ['message'] } },
      },
    ],
    icon: 'file:openAi.svg',
  },
  {
    name: 'n8n-nodes-base.gmail',
    displayName: 'Gmail',
    group: ['transform'],
    version: 2,
    codex: { categories: ['Communication'], alias: ['Email', 'Google Mail'] },
    credentials: [{ name: 'gmailOAuth2', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        default: 'message',
        options: [
          { name: 'Message', value: 'message' },
          { name: 'Label', value: 'label' },
        ],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'send',
        displayOptions: { show: { resource: ['message'] } },
        options: [
          { name: 'Send', value: 'send' },
          { name: 'Get', value: 'get' },
          { name: 'Get Many', value: 'getAll' },
        ],
      },
      {
        displayName: 'To',
        name: 'sendTo',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['message'], operation: ['send'] } },
      },
      {
        displayName: 'Subject',
        name: 'subject',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['message'], operation: ['send'] } },
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['message'], operation: ['send'] } },
      },
    ],
    icon: 'file:gmail.svg',
  },
  {
    name: 'n8n-nodes-base.slack',
    displayName: 'Slack',
    group: ['output'],
    version: 2,
    codex: { categories: ['Communication'] },
    credentials: [{ name: 'slackApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        default: 'message',
        options: [{ name: 'Message', value: 'message' }],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'post',
        displayOptions: { show: { resource: ['message'] } },
        options: [{ name: 'Post', value: 'post' }],
      },
      {
        displayName: 'Channel',
        name: 'channel',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['message'], operation: ['post'] } },
      },
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['message'], operation: ['post'] } },
      },
    ],
    icon: 'file:slack.svg',
  },
  {
    name: 'n8n-nodes-base.httpRequest',
    displayName: 'HTTP Request',
    group: ['output'],
    version: 4,
    codex: { categories: ['Development'] },
    properties: [
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
        ],
      },
      { displayName: 'URL', name: 'url', type: 'string', default: '', required: true },
    ],
    icon: 'fa:globe',
  },
  {
    name: 'n8n-nodes-base.if',
    displayName: 'If',
    group: ['transform'],
    version: 2,
    codex: { categories: ['Core Nodes'] },
    properties: [
      {
        displayName: 'Conditions',
        name: 'conditions',
        type: 'fixedCollection',
        default: {},
      },
    ],
    icon: 'fa:map-signs',
  },
  {
    name: 'n8n-nodes-base.set',
    displayName: 'Edit Fields (Set)',
    group: ['input'],
    version: 3,
    codex: { categories: ['Core Nodes'] },
    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        default: 'manual',
        options: [
          { name: 'Manual Mapping', value: 'manual' },
          { name: 'JSON', value: 'raw' },
        ],
      },
    ],
    icon: 'fa:pen',
  },
];

const MOCK_CREDENTIALS: N8nCredentialTypeDescription[] = [
  {
    name: 'openAiApi',
    displayName: 'OpenAI',
    documentationUrl: 'https://docs.n8n.io/integrations/builtin/credentials/openai/',
    properties: [
      { displayName: 'API Key', name: 'apiKey', type: 'string', required: true, default: '' },
    ],
    icon: 'file:openAi.svg',
  },
  {
    name: 'gmailOAuth2',
    displayName: 'Gmail OAuth2',
    properties: [
      { displayName: 'Client ID', name: 'clientId', type: 'string', default: '' },
      { displayName: 'Client Secret', name: 'clientSecret', type: 'string', default: '' },
    ],
    icon: 'file:gmail.svg',
  },
  {
    name: 'slackApi',
    displayName: 'Slack API',
    properties: [
      { displayName: 'Access Token', name: 'accessToken', type: 'string', required: true, default: '' },
    ],
    icon: 'file:slack.svg',
  },
];

export function getMockCatalog(): N8nCatalogSnapshot {
  return {
    nodes: MOCK_NODES,
    credentials: MOCK_CREDENTIALS,
    fetchedAt: new Date().toISOString(),
    source: 'mock',
  };
}
