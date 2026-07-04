import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

/** JSON-Schema-artige Tool-Parameter-Definition (an Mistral/Gemini übergeben). */
export interface ToolSchema {
  type: string;
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
}

export interface AITool {
  name: string;
  description: string;
  schema: ToolSchema;
}

export const AXANTILO_TOOLS: AITool[] = [
  {
    name: "search_knowledge",
    description: "Durchsucht Axantilos zentrale Wissensdatenbank: Tool-Anleitungen, UI-How-tos (wie man etwas in Axantilo macht), abgedeckte Use-Cases, Branchen-Infos und Workflow-Bausteine. Nutze es, BEVOR du antwortest, wenn: der Nutzer fragt WIE man etwas in Axantilo oder einem Tool macht; ein Tool eingerichtet/verbunden werden soll; oder du einen Workflow bzw. einen Schritt vorschlagen oder bauen willst. Die Treffer haben einen Relevanz-Score (similarity) und Metadaten (z.B. branche). Verwende nur, was zur Situation des Nutzers passt — ignoriere unpassende Treffer (falsche Branche, falsches Tool, niedrige Relevanz) und erfinde nichts dazu. Erwähne das Tool oder die Datenbank NIE im Chat.",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Wonach gesucht wird, in natürlicher Sprache (z.B. 'Gmail in n8n verbinden', 'Angebot aus Gesprächsnotiz automatisieren', 'Credential in Axantilo hinterlegen')."
        },
        kategorie: {
          type: "string",
          enum: ["tool", "ui_guide", "use_case", "branche", "template_baustein", "template_workflow", "wissen"],
          description: "Optional: auf eine Wissensart einschränken. Weglassen, um alles zu durchsuchen."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "web_search",
    description: "Sucht LIVE im Internet. Nutze es, wenn der Nutzer ein Tool, einen Service oder Begriff nennt, das/den du nicht (sicher) kennst (z.B. eine Nischen-Software wie 'onepage'), ODER wenn es um den AKTUELLEN Stand geht (neueste Features, Preise, Integrationen, Limits eines Tools). Reihenfolge: erst search_knowledge (interne DB), dann web_search, wenn das nichts Passendes liefert oder es um Aktuelles geht. Im Zweifel lieber suchen als raten — antworte nie aus unsicherem oder veraltetem Wissen über fremde Tools. Erwähne das Tool, die Suche oder Quellen-Mechanik NIE im Chat; antworte einfach fundiert in normalem Fließtext (eine kurze Quellenangabe ist ok).",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Suchanfrage in natürlicher Sprache (z.B. 'onepage Webdesign Tool aktuelle Funktionen', 'was ist Cal.com', 'Notion AI neueste Features'). Bei Preisen: '<Tool> pricing' bzw. '<Tool> Preise offizielle Seite' — die offizielle Preisseite ist die maßgebliche Quelle. Trage KEIN festes/veraltetes Jahr ein — nutze Wörter wie 'aktuell'/'neueste', damit der jeweils neueste Stand gefunden wird."
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
          description: "Name der nächsten Phase (z.B. 'analyse', 'umsetzung')"
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
    description: "Ändert einen bereits gebauten Workflow auf dem Canvas. DU baust die geänderte KOMPLETTE Schrittliste selbst (wie bei build_workflow) und gibst sie mit — kein separater Editor. Schritte, die du UNVERÄNDERT lässt, MIT IHRER id aus {{workflows}} übernehmen → sie behalten ihre Konfiguration/Zugänge. Weggelassene Schritte werden gelöscht. Nur wenn der Workflow schon in {{workflows}} steht (NICHT für den ersten Build).",
    schema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "Die id des gebauten Workflows (z.B. wf_1)"
        },
        steps: {
          type: "array",
          description: "Die komplette überarbeitete Schrittliste (chronologisch). Erster Schritt = trigger.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "id eines bestehenden Schritts aus {{workflows}}, wenn unverändert (behält Konfiguration). Bei neuem Schritt weglassen." },
              label: { type: "string", description: "Kurzer deutscher Schritt-Text (was passiert)" },
              type: { type: "string", description: "trigger | action | ai | decision | human | output" },
              tool: { type: "string", description: "Tool/Node, z.B. gmail, slack, googleDrive, chainLlm, agent, if, webhook" }
            },
            required: ["label"]
          }
        },
        edges: {
          type: "array",
          description: "Optional: Verzweigung/Schleife. Pro Edge {from, to} (1-basierte Schritt-Nr.), optional branch 'true'|'false'|'default'. Ohne edges werden die Schritte linear verbunden; Freigabe-Schleifen entstehen automatisch.",
          items: {
            type: "object",
            properties: {
              from: { type: "number" },
              to: { type: "number" },
              branch: { type: "string" }
            }
          }
        }
      },
      required: ["workflow_id", "steps"]
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
    name: "create_document_template",
    description: "Legt eine wiederverwendbare Dokument-/Nachrichten-Vorlage für einen Workflow (Angebot, Vertrag, E-Mail, WhatsApp, Report, KI-Prompt) live auf dem Canvas ab. WICHTIG: Du (der Coach) baust die Vorlage selbst — du hast den hochgeladenen Muster-Text und den ganzen Gesprächskontext. Schau dir das Muster an (oder entwirf neu), erkenne selbst, welche Stellen fallabhängig sind (Kundenname, Beträge, Datum, Positionen) und welche immer gleich bleiben (Firmenkopf, Standardsätze, Struktur). Die variablen Stellen ersetzt du durch Platzhalter {{snake_case_key}}; den Rest lässt du wörtlich stehen. Übergib den fertigen Vorlagentext in `content`, die Platzhalter-Liste in `placeholders` und ein vollständig ausgefülltes, ANONYMISIERTES Beispiel in `example_filled` (das Original mit personenbezogenen/privaten Daten durch realistische Fake-Werte ersetzt — dient der Laufzeit-KI als Stil-Beispiel im System-Prompt). Das System erfindet nichts — es speichert nur, was du mitgibst. Nutzbar in Phase 3 (wenn der Nutzer ein Muster hochlädt) und Phase 4 (Einbau in den Workflow).",
    schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titel der Vorlage (z.B. 'Angebot — Vorlage', 'Onboarding-E-Mail')"
        },
        linked_workflow: {
          type: "string",
          description: "id des Workflows, zu dem die Vorlage gehört (z.B. wf_1). Leer lassen, wenn keiner passt."
        },
        role: {
          type: "string",
          enum: ["input", "output"],
          description: "Verbraucht der Workflow das Dokument (input, z.B. eingehende Anfrage) oder erzeugt er es (output, z.B. das fertige Angebot)?"
        },
        delivery: {
          type: "string",
          enum: ["document", "text"],
          description: "document = echtes Datei-Template (Angebot/Vertrag) mit Platzhalter-Ersatz. text = KI erzeugt den Text je Lauf (einfache Mail/Nachricht). Echte Dokumente → document; einfache Mails/Nachrichten → text (selbst entscheiden)."
        },
        target_format: {
          type: "string",
          enum: ["google_docs", "google_sheets", "text", "email", "whatsapp"],
          description: "Zielformat zur Laufzeit. Angebot/Vertrag → google_docs; Tabelle/Liste → google_sheets; Mail → email; Nachricht → whatsapp/text."
        },
        source: {
          type: "string",
          enum: ["user_upload", "axantilo_generated"],
          description: "Woher die Vorlage stammt: user_upload (aus hochgeladenem Muster templatisiert) oder axantilo_generated (neu entworfen)."
        },
        source_file_url: {
          type: "string",
          description: "Optional: URL des hochgeladenen Original-Dokuments (zur Referenz)."
        },
        content: {
          type: "string",
          description: "Der fertige Vorlagentext (Markdown/Text), den DU gebaut hast — konkrete Werte bereits durch {{platzhalter}} ersetzt. Bei Tabellen/Sheets als Markdown-Tabelle mit Platzhaltern in den Zellen."
        },
        example_filled: {
          type: "string",
          description: "Ein vollständig AUSGEFÜLLTES Beispiel der Vorlage (keine Platzhalter mehr) — bei source=user_upload der Original-Text, aber mit personenbezogenen/privaten Daten anonymisiert (echte Namen/Beträge/Adressen → realistische Fake-Werte wie 'Mustermann GmbH'). Bei axantilo_generated ein plausibles erfundenes Beispiel. Geht als Few-Shot-Beispiel in den System-Prompt der Laufzeit-KI."
        },
        placeholders: {
          type: "array",
          description: "Alle im content verwendeten Platzhalter. Jeder Platzhalter im content MUSS hier gelistet sein und umgekehrt.",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Schlüssel in snake_case, ohne Klammern, z.B. kunde_name" },
              label: { type: "string", description: "Anzeige-Label, z.B. Kundenname" },
              description: { type: "string", description: "Optional: woher der Wert kommt / was reinkommt" },
              example: { type: "string", description: "Optional: Beispielwert, z.B. 'Mustermann GmbH'" }
            },
            required: ["key", "label"]
          }
        }
      },
      required: ["title", "role", "delivery", "source", "content", "placeholders"]
    }
  }
];

/** Phase-gated tool list — research_solutions gehört zur gemergten Analyse; build_workflow zur Umsetzung. */
export function getToolsForPhase(phase: string): AITool[] {
  // Gemergte Phase 2 (Analyse & Plan); 'plan' als Legacy-Alias.
  if (phase === 'analyse' || phase === 'plan') {
    return AXANTILO_TOOLS.filter(t => t.name !== 'build_workflow');
  }
  if (phase === 'umsetzung') {
    return AXANTILO_TOOLS.filter(t => t.name !== 'research_solutions');
  }
  // Phase 1 (Diagnose): weder Recherche, noch Build, noch Vorlagen-Templatisierung.
  return AXANTILO_TOOLS.filter(
    t => t.name !== 'research_solutions' && t.name !== 'build_workflow' && t.name !== 'create_document_template',
  );
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
export function toMistralTools(tools: AITool[]) {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema
    }
  }));
}
