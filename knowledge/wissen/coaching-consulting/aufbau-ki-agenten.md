---
type: bot_reference
vertical: coaching_consulting
phase: [3, 4]
pfad: [all]
topic: ai_agent_design
---

# Aufbau und Steuerung von KI-Agenten

Ein KI-Agent baut auf drei Bausteinen auf: einem Sprachmodell als Entscheidungskern, einem Gedächtnis für den Gesprächsverlauf und Werkzeugen für den Zugriff auf externe Software. Über einen System-Prompt erhält der Agent seine konkrete Aufgabe; anders als ein reiner Chatbot kann er durch die Werkzeuge aktiv Aktionen ausführen, etwa Einträge anlegen oder Daten abrufen. Prompts werden am besten entlang von drei Punkten strukturiert: welche Daten als Eingabe dienen, in welcher Schrittfolge sie verarbeitet werden und wie das Ergebnis ausgegeben wird. Den System-Prompt muss man nicht selbst formulieren, sondern kann ihn mit einem Sprachmodell entwerfen lassen, idealerweise mit Angabe des Zielmodells.