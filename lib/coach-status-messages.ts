import { shouldSuppressPlanWorkflowCoachNotice } from '@/lib/plan-workflows';
import type { CanvasData } from '@/lib/types';

/**
 * Sichtbare Coach-Erklärungen im Chat (Was + Warum) — kein [System:]-Prefix.
 */

export function coachStatusMessageForCanvas(
  reason: string | undefined,
  phase: string,
  canvas?: Partial<CanvasData>,
): string | null {
  if (canvas && shouldSuppressPlanWorkflowCoachNotice(phase, canvas, reason)) {
    return null;
  }

  switch (reason) {
    case 'plan_awaiting_workflow_chat':
    case 'thin_user_context':
      if (phase === 'umsetzung') return null;
      if (phase === 'plan') {
        return (
          'Kurz zur Roadmap rechts: Den Workflow-Plan lege ich an, sobald wir hier einen ' +
          'konkreten Ablauf für einen Pain Point besprochen haben. Dafür brauche ich noch ' +
          'deine Antwort — danach skizziere ich den Plan automatisch dort.'
        );
      }
      if (phase === 'diagnose') {
        return (
          'Die Unternehmens- und Pain-Point-Karte rechts fülle ich aus, sobald du mir ' +
          'ein paar konkrete Beispiele aus deinem Alltag geschrieben hast — ein kurzer Satz reicht.'
        );
      }
      if (phase === 'analyse') {
        return (
          'Die Tool-Übersicht rechts ergänze ich, sobald du mir zu den genutzten Programmen ' +
          'etwas Konkretes geschrieben hast — dann trage ich das dort ein.'
        );
      }
      return (
        'Die Roadmap rechts aktualisiere ich gleich, sobald wir genug Kontext im Chat haben — ' +
        'schreib mir kurz die nächste Antwort.'
      );

    case 'orchestration_deferred':
    case 'orchestration_blocked':
      return (
        'Den Workflow-Plan rechts baue ich erst, wenn wir hier im Chat einen klaren Ablauf ' +
        'für genau einen Pain Point durchhaben — nicht vorher. Lass uns mit deiner Antwort ' +
        'weitermachen, dann erscheint der Plan dort.'
      );

    case 'insufficient_context':
      return (
        'Ich hab die Roadmap rechts noch nicht aktualisiert — mir fehlt noch ein Stück Kontext ' +
        'aus unserem Gespräch. Beantworte bitte meine letzte Frage, dann trage ich es ein.'
      );

    case 'hidden_init':
      return null;

    default:
      return null;
  }
}

/** Nach erfolgreichem Canvas-Update — optional, wenn Coach gerade trigger gesendet hat. */
export function coachStatusMessageCanvasUpdating(phase: string): string | null {
  if (phase === 'plan') {
    return 'Ich skizziere den Workflow gerade in der Roadmap rechts — einen Moment, dann kannst du dort die Schritte prüfen.';
  }
  if (phase === 'diagnose' || phase === 'analyse') {
    return 'Ich trage das gerade in die Roadmap rechts ein — einen Moment.';
  }
  return null;
}
