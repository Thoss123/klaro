import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

export interface AITool {
  name: string;
  description: string;
  schema: any;
}

export const KLARO_TOOLS: AITool[] = [
  {
    name: "prepare_phase",
    description: "Bereitet die nächste Projektphase vor, z.B. Erstellung von Zusammenfassungen.",
    schema: {
      type: "object",
      properties: {
        next_phase: {
          type: "string",
          description: "Name der nächsten Phase (z.B. 'analyse', 'plan', 'umsetzung')"
        }
      },
      required: ["next_phase"]
    }
  },
  {
    name: "request_credential",
    description: "Öffnet ein Popup für den Benutzer, um API-Keys oder OAuth-Logins für ein bestimmtes Tool bereitzustellen.",
    schema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Name des Tools (z.B. 'gmail', 'slack')"
        },
        type: {
          type: "string",
          enum: ["api_key", "oauth"],
          description: "Art des Credentials"
        }
      },
      required: ["tool", "type"]
    }
  },
  {
    name: "deploy_workflow",
    description: "Deployed einen vorbereiteten Workflow auf der n8n-Instanz.",
    schema: {
      type: "object",
      properties: {
        use_case_id: {
          type: "string",
          description: "ID des Use Cases, zu dem der Workflow gehört"
        }
      },
      required: ["use_case_id"]
    }
  },
  {
    name: "test_workflow",
    description: "Führt einen Testlauf eines deployten Workflows aus und liefert das Ergebnis.",
    schema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "ID des Workflows in n8n"
        }
      },
      required: ["workflow_id"]
    }
  }
];

// Helper for Gemini
function mapToGeminiType(type: string): SchemaType {
  switch (type) {
    case 'string': return SchemaType.STRING;
    case 'number': return SchemaType.NUMBER;
    case 'integer': return SchemaType.INTEGER;
    case 'boolean': return SchemaType.BOOLEAN;
    case 'array': return SchemaType.ARRAY;
    case 'object': return SchemaType.OBJECT;
    default: return SchemaType.STRING;
  }
}

export function toGeminiTools(tools: AITool[]): FunctionDeclaration[] {
  return tools.map(tool => {
    const properties: Record<string, any> = {};
    for (const key of Object.keys(tool.schema.properties)) {
      const prop = tool.schema.properties[key];
      properties[key] = {
        type: mapToGeminiType(prop.type),
        description: prop.description,
        ...(prop.enum ? { enum: prop.enum } : {})
      };
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties,
        required: tool.schema.required || []
      }
    };
  });
}

// Helper for Mistral
export function toMistralTools(tools: AITool[]): any[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema
    }
  }));
}
