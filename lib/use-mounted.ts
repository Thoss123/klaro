import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR and the first (hydration) render, then `true` on the client.
 * Hydration-safe replacement for the `useEffect(() => setMounted(true), [])` pattern —
 * avoids the setState-in-effect render cascade while still gating client-only portals.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
