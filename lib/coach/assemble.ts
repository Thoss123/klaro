import { readFileSync } from 'fs';
import path from 'path';
import { AXANTILO_SHARED_RULES } from '@/lib/claude';

/**
 * Coach v2 — modularer System-Prompt aus /coach/prompts.
 *
 * Aufbau pro Request: AXANTILO_SHARED_RULES (Tag-/Stil-Vertrag der App)
 * + base.md (Identität, Modus-Regel, Einwände, Guardrails, Stand)
 * + Phasenmodul (ersetzt {{phase_module}} in base.md).
 * Alle übrigen {{platzhalter}} füllt weiterhin app/api/chat/route.ts.
 *
 * Revert: COACH_V2=false in .env.local → alter Prompt-Pfad (lib/claude.ts).
 */

const PHASE_MODULE_FILES: Record<string, string> = {
  diagnose: 'phase_diagnose.md',
  analyse: 'phase_analyse.md',
  plan: 'phase_analyse.md', // Legacy-Alias: alte 'plan'-Sessions laufen im gemergten Analyse-Modul
  umsetzung: 'phase_umsetzung.md',
};

export function isCoachV2Enabled(): boolean {
  return process.env.COACH_V2 !== 'false';
}

// Im Dev immer frisch von der Platte lesen (Prompt-Iteration ohne Neustart),
// in Produktion pro Prozess cachen.
const fileCache = new Map<string, string>();

function loadPromptFile(fileName: string): string {
  if (process.env.NODE_ENV === 'production') {
    const cached = fileCache.get(fileName);
    if (cached !== undefined) return cached;
  }
  const filePath = path.join(process.cwd(), 'coach', 'prompts', fileName);
  const content = readFileSync(filePath, 'utf8');
  fileCache.set(fileName, content);
  return content;
}

/**
 * Assembliert den modularen Coach-Prompt für eine Phase.
 * Gibt null zurück, wenn die Prompt-Dateien nicht lesbar sind —
 * die Route fällt dann auf den alten Prompt-Pfad zurück (fail-open).
 */
export function getCoachSystemPrompt(phase: string): string | null {
  try {
    const moduleFile = PHASE_MODULE_FILES[phase] ?? PHASE_MODULE_FILES.diagnose;
    const base = loadPromptFile('base.md');
    const phaseModule = loadPromptFile(moduleFile);
    if (!base.includes('{{phase_module}}')) {
      console.error('[coach-v2] base.md ohne {{phase_module}}-Platzhalter — Fallback auf alten Prompt');
      return null;
    }
    return AXANTILO_SHARED_RULES + '\n\n' + base.replace('{{phase_module}}', phaseModule);
  } catch (e: unknown) {
    console.error('[coach-v2] Prompt-Assembly fehlgeschlagen — Fallback auf alten Prompt:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
