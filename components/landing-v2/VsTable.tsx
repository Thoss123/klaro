import type { ReactNode } from 'react';

export type VsRow = { crit: string; old: ReactNode; neu: ReactNode };

// Vergleichstabelle (z. B. AI-Agentur vs. Axantilo). Desktop: 3-Spalten-Grid,
// mobil zerfällt jede Zeile in eine Karte mit beschrifteten Zellen (CSS in styles.ts).
export default function VsTable({
  rows,
  oldLabel = 'AI-Agentur',
  newLabel = 'Axantilo',
}: {
  rows: VsRow[];
  oldLabel?: string;
  newLabel?: string;
}) {
  return (
    <div className="vs-table rv rv-d2">
      <div className="vs-row vs-head">
        <div />
        <div>{oldLabel}</div>
        <div className="vs-ax">{newLabel}</div>
      </div>
      {rows.map((row) => (
        <div className="vs-row" key={row.crit}>
          <div className="vs-crit">{row.crit}</div>
          <div className="vs-old">
            <span className="vs-cell-label">{oldLabel}</span>
            {row.old}
          </div>
          <div className="vs-new">
            <span className="vs-cell-label">{newLabel}</span>
            {row.neu}
          </div>
        </div>
      ))}
    </div>
  );
}
