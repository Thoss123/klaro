---
type: template_baustein
kategorie: ai
n8n_nodes: [@n8n/n8n-nodes-langchain.agent, @n8n/n8n-nodes-langchain.lmChatMistralCloud, @n8n/n8n-nodes-langchain.lmChatOpenAi, @n8n/n8n-nodes-langchain.memoryBufferWindow, @n8n/n8n-nodes-langchain.toolHttpRequest]
wiederverwendbar: true
---

# Bau-Pattern: AI-Agent-Kette

## Wann nutzen
Immer wenn KI Text generieren, Inhalte bewerten/entscheiden oder Tools (APIs, Suche) nutzen soll — z. B. „fasse die Mail zusammen", „formuliere eine Antwort", „kategorisiere den Lead".

## So wird es gebaut
1. **AI Agent** (`@n8n/n8n-nodes-langchain.agent`) kommt als normaler Schritt in den Hauptflow (zwischen Trigger und Folge-Schritt).
2. **Chat Model** (z. B. `lmChatMistralCloud`, `lmChatOpenAi`) wird als **Sub-Node** an den Agent gehängt — Slot `ai_languageModel`, Pflicht, genau 1.
3. Optional: **Memory** (`memoryBufferWindow`) am Slot `ai_memory` (max 1) und **Tools** (`toolHttpRequest`, Vector Stores) am Slot `ai_tool` (mehrere möglich).

Die Verbindung Model→Agent ist eine Spezial-Edge mit `connectionType: "ai_languageModel"` (bzw. `ai_memory` / `ai_tool`) — keine normale Flow-Verbindung.

## Häufigster Fehler
Ein Chat Model (Mistral, OpenAI Chat Model, Anthropic, Gemini) **direkt in den Hauptflow** zu hängen. Diese Nodes haben keinen normalen Output und zerschießen den Workflow. Sie funktionieren NUR als Sub-Node an Agent / Basic LLM Chain / Summarization Chain.

Ausnahme: `@n8n/n8n-nodes-langchain.openAi` (der „OpenAI"-Node mit message-Operation) darf allein im Hauptflow stehen.

## Modellwahl
Das konkrete Modell wird am Sub-Node über `parameters.model` gesetzt (z. B. `"mistral-large-latest"`), nicht am Agent.
