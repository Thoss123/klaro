import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

export interface AITool {
  name: string;
  description: string;
  schema: any;
}

export const KLARO_TOOLS: AITool[] = [
  {
    name: "search_knowledge",
    description: "Durchsucht Klaros zentrale Wissensdatenbank: Tool-Anleitungen, UI-How-tos (wie man etwas in Klaro macht), abgedeckte Use-Cases, Branchen-Infos und Workflow-Bausteine. Nutze es, BEVOR du antwortest, wenn: der Nutzer fragt WIE man etwas in Klaro oder einem Tool macht; ein Tool eingerichtet/verbunden werden soll; oder du einen Workflow bzw. einen Schritt vorschlagen oder bauen willst. Die Treffer haben einen Relevanz-Score (similarity) und Metadaten (z.B. branche). Verwende nur, was zur Situation des Nutzers passt — ignoriere unpassende Treffer (falsche Branche, falsches Tool, niedrige Relevanz) und erfinde nichts dazu. Erwähne das Tool oder die Datenbank NIE im Chat.",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Wonach gesucht wird, in natürlicher Sprache (z.B. 'Gmail in n8n verbinden', 'Angebot aus Gesprächsnotiz automatisieren', 'Credential in Klaro hinterlegen')."
        },
        kategorie: {
          type: "string",
          enum: ["tool", "ui_guide", "use_case", "branche", "template_baustein", "template_workflow"],
          description: "Optional: auf eine Wissensart einschränken. Weglassen, um alles zu durchsuchen."
        }
      },
      required: ["query"]
    }
  },
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
  },
  {
    name: "edit_workflow",
    description: "Bearbeitet einen bereits gebauten Workflow auf dem Canvas (z.B. OpenAI → Mistral, Schritt tauschen, IF einfügen). Nur wenn der Workflow schon in {{workflows}} steht — NICHT für den ersten Build.",
    schema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "Die id des gebauten Workflows (z.B. wf_1)"
        },
        instruction: {
          type: "string",
          description: "Was geändert werden soll, z.B. 'OpenAI zu Mistral ändern' oder 'Schritt 2 soll Gmail sein'"
        }
      },
      required: ["workflow_id", "instruction"]
    }
  },
  {
    name: "build_workflow",
    description: "Baut live einen Workflow im Editor auf dem Canvas (n8n-Nodes, React-Flow-Graph). Nur in Phase 4. ZWEI Modi: (A) bestehenden Plan bauen → nur workflow_id aus workflow_plans. (B) NEUEN Workflow bauen (auch ohne Pain Point, wenn der Nutzer etwas anderes will) → title + steps mitgeben. Schritte: 5–9, jeder mit kurzem Label + type. Erster Schritt MUSS type=trigger sein.",
    schema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "Modus A: id des Workflow-Plans aus workflow_plans (z.B. wf_1). Bei neuem Workflow weglassen."
        },
        title: {
          type: "string",
          description: "Titel des Workflows. Pflicht bei neuem Workflow (Modus B), sonst optional."
        },
        steps: {
          type: "array",
          description: "Modus B (neuer Workflow): die Ablauf-Schritte. Nur nötig, wenn kein passender Plan existiert.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Kurzer deutscher Schritt-Text (was passiert)" },
              type: { type: "string", description: "trigger | action | ai | decision | human | output" }
            },
            required: ["label"]
          }
        },
        linked_pain_point: {
          type: "string",
          description: "Optional: id des Pain Points, den dieser Workflow löst. Kann leer sein."
        }
      },
      required: []
    }
  },
  {
    name: "research_solutions",
    description: "Recherchiert (Phase 3) Lösungsansätze für einen Pain Point: was andere mit welchen Tools machen, Automatisierungsniveau, Vor- und Nachteile. Liefert 2–3 strukturierte Ansätze zurück, die du dem Nutzer zur Auswahl vorstellst.",
    schema: {
      type: "object",
      properties: {
        pain_point_id: {
          type: "string",
          description: "Die id des Pain Points aus dem Canvas (z.B. 'pp_1')"
        },
        pain_point_title: {
          type: "string",
          description: "Der Titel / das Thema des Pain Points"
        },
        tools_mentioned: {
          type: "array",
          items: { type: "string" },
          description: "Tools, die der Nutzer für diesen Prozess bereits nutzt"
        },
        context: {
          type: "string",
          description: "1–2 Sätze, was der Nutzer über diesen Prozess gesagt hat"
        }
      },
      required: ["pain_point_title"]
    }
  },
  {
    name: "create_workflow_plan",
    description: "Erstellt den konkreten Ablaufplan für einen Workflow und legt ihn live auf dem Canvas ab. Nutze dieses Tool in Phase 3, sobald sich der Nutzer für eine spezifische Automatisierungs-Lösung entschieden hat.",
    schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titel des Workflows (z.B. 'Lead Qualifizierung')"
        },
        description: {
          type: "string",
          description: "Kurze Beschreibung des Workflows"
        },
        pain_point_id: {
          type: "string",
          description: "ID des zugehörigen Pain Points (z.B. 'pp_1')"
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Name des Schritts (z.B. 'Neue E-Mail', 'Daten extrahieren')" },
              tool: { type: "string", description: "Verwendetes Tool (z.B. 'gmail', 'openai', 'slack', 'webhook', 'schedule', 'if')" },
              type: { type: "string", enum: ["trigger", "action", "ai", "human", "decision"], description: "Kategorie des Schritts" },
              description: { type: "string", description: "Was genau in diesem Schritt passiert" }
            },
            required: ["label", "tool", "type"]
          },
          description: "Die einzelnen Workflow-Schritte in chronologischer Reihenfolge."
        }
      },
      required: ["title", "description", "pain_point_id", "steps"]
    }
  }
];

/** Phase-gated tool list — research_solutions is Phase 3 only; build_workflow is Phase 4 only. */
export function getToolsForPhase(phase: string): AITool[] {
  if (phase === 'plan') {
    return KLARO_TOOLS.filter(t => t.name !== 'build_workflow');
  }
  if (phase === 'umsetzung') {
    return KLARO_TOOLS.filter(t => t.name !== 'research_solutions');
  }
  return KLARO_TOOLS.filter(t => t.name !== 'research_solutions' && t.name !== 'build_workflow');
}

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

/** Recursively map JSON-Schema props to Gemini Schema (arrays need `items`, objects need `properties`). */
function toGeminiPropertySchema(prop: Record<string, unknown>): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: mapToGeminiType(String(prop.type ?? 'string')),
  };
  if (prop.description) schema.description = prop.description;
  if (prop.enum) schema.enum = prop.enum;

  if (prop.type === 'array' && prop.items) {
    schema.items = toGeminiPropertySchema(prop.items as Record<string, unknown>);
  }
  if (prop.type === 'object' && prop.properties) {
    const nested: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(prop.properties as Record<string, Record<string, unknown>>)) {
      nested[key] = toGeminiPropertySchema(val);
    }
    schema.properties = nested;
    if (Array.isArray(prop.required) && prop.required.length) {
      schema.required = prop.required;
    }
  }
  return schema;
}

export function toGeminiTools(tools: AITool[]): FunctionDeclaration[] {
  return tools.map(tool => {
    const properties: Record<string, unknown> = {};
    for (const key of Object.keys(tool.schema.properties)) {
      properties[key] = toGeminiPropertySchema(tool.schema.properties[key]);
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties,
        required: tool.schema.required || []
      }
    } as unknown as FunctionDeclaration;
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
