import {
  applyPrepStep,
  createInitialPrepProgress,
  parsePrepProgress,
  type StrategyPrepProgress,
} from '@/lib/strategy-prep';

export type StrategyPrepStreamEvent =
  | { type: 'progress'; progress: StrategyPrepProgress }
  | { type: 'done'; status: string; progress?: StrategyPrepProgress }
  | { type: 'error'; reason: string; progress?: StrategyPrepProgress };

/** POST /api/strategy mit stream:true — NDJSON-Zeilen für Live-Fortschritt. */
export async function runStrategyPrepStream(
  sessionId: string,
  projectId: string,
  onProgress: (progress: StrategyPrepProgress) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: string }> {
  let lastProgress = createInitialPrepProgress();
  onProgress(lastProgress);

  const res = await fetch('/api/strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'initial', sessionId, projectId, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    return { ok: false, status: `http_${res.status}` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalStatus = 'unknown';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed) as StrategyPrepStreamEvent;
        if (evt.type === 'progress' && evt.progress) {
          lastProgress = evt.progress;
          onProgress(lastProgress);
        } else if (evt.type === 'done') {
          finalStatus = evt.status;
          if (evt.progress) onProgress(evt.progress);
        } else if (evt.type === 'error') {
          finalStatus = evt.reason;
          if (evt.progress) onProgress(evt.progress);
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  return { ok: finalStatus === 'updated' || finalStatus === 'skipped', status: finalStatus };
}

/** Pollt GET /api/strategy/progress bis done oder Timeout. */
export async function pollStrategyPrepProgress(
  sessionId: string,
  onProgress: (progress: StrategyPrepProgress | null) => void,
  maxWaitMs = 55_000,
  intervalMs = 700,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  let failStreak = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`/api/strategy/progress?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        failStreak = 0;
        const data = await res.json();
        const progress = parsePrepProgress(data.progress);
        onProgress(progress);
        if (data.ready || progress?.done) return true;
        if (progress?.error) return false;
      } else {
        failStreak += 1;
        if (failStreak >= 3) return false;
      }
    } catch {
      failStreak += 1;
      if (failStreak >= 3) return false;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
