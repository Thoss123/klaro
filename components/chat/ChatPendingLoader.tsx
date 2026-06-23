import React from 'react';

/** Shown while waiting for the coach reply (before first visible tokens). */
export default function ChatPendingLoader() {
  return (
    <div className="flex items-start gap-3 mb-8 pl-1" aria-live="polite" aria-busy="true">
      <div className="momentum shrink-0 mt-1" aria-hidden="true" />
      <span className="btn-shine">Axantilo denkt nach…</span>
    </div>
  );
}
