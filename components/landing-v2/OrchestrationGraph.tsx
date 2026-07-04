export type GraphNode = { label: string; sub: string };

type Props = {
  /** Genau 4 Eingangs-Tools (links bzw. mobil oben). `label` muss mobil in einen 78px-Chip passen. */
  inputs: [GraphNode, GraphNode, GraphNode, GraphNode];
  /** Genau 4 Ergebnisse (rechts bzw. mobil unten). */
  outputs: [GraphNode, GraphNode, GraphNode, GraphNode];
  /** Zwei Textzeilen unter dem Axantilo-Kern (desktop); mobil zusammengefügt. */
  coreSub: [string, string];
  /** Eindeutiger Präfix für SVG-Pfad-IDs (mpath-Referenzen). */
  idPrefix: string;
  ariaDesktop: string;
  ariaMobile: string;
};

const DESKTOP_IN = [
  { y: 44, path: 'M 190 70  C 330 70, 380 185, 480 195' },
  { y: 139, path: 'M 190 165 C 320 165, 370 200, 480 205' },
  { y: 234, path: 'M 190 260 C 320 260, 370 225, 480 215' },
  { y: 329, path: 'M 190 355 C 330 355, 380 240, 480 225' },
] as const;

const DESKTOP_OUT = [
  { y: 32, path: 'M 620 190 C 720 175, 750 65,  880 60' },
  { y: 130, path: 'M 620 202 C 730 195, 770 160, 880 158' },
  { y: 228, path: 'M 620 218 C 730 225, 770 260, 880 256' },
  { y: 326, path: 'M 620 230 C 720 245, 750 355, 880 354' },
] as const;

const DESKTOP_PULSES = [
  { dur: '3.2s', begin: '0s' },
  { dur: '3.2s', begin: '1.4s' },
  { dur: '3.2s', begin: '0.7s' },
  { dur: '3.2s', begin: '2.1s' },
  { dur: '2.6s', begin: '1.6s' },
  { dur: '2.6s', begin: '2.4s' },
  { dur: '2.6s', begin: '0.9s' },
  { dur: '2.6s', begin: '3.0s' },
] as const;

// Mobil: 4 Tool-Chips oben, Fan-in in den Kern, darunter Ergebnis-Zeilen an
// einer Leiste — statt vier deckungsgleicher Linien übereinander.
const MOBILE_CHIPS = [
  { x: 16, cx: 55, path: 'M 55 46 C 55 92, 118 118, 170 150' },
  { x: 102, cx: 141, path: 'M 141 46 C 141 96, 162 118, 177 150' },
  { x: 188, cx: 227, path: 'M 227 46 C 227 96, 198 118, 183 150' },
  { x: 274, cx: 313, path: 'M 313 46 C 313 92, 242 118, 190 150' },
] as const;

const MOBILE_ROWS = [340, 404, 468, 532] as const;
const MOBILE_SPINE = 'M 180 230 C 180 262, 26 254, 26 306 L 26 559';

export default function OrchestrationGraph({
  inputs,
  outputs,
  coreSub,
  idPrefix,
  ariaDesktop,
  ariaMobile,
}: Props) {
  return (
    <>
      {/* orchestration graph — desktop (horizontal) */}
      <div className="graph-shell graph-shell--desktop rv rv-d4">
        <svg className="graph" viewBox="0 0 1080 420" role="img" aria-label={ariaDesktop}>
          {DESKTOP_IN.map((n, i) => (
            <path key={i} id={`${idPrefix}-p${i + 1}`} className="gpath" d={n.path} />
          ))}
          {DESKTOP_OUT.map((n, i) => (
            <path key={i} id={`${idPrefix}-p${i + 5}`} className="gpath" d={n.path} />
          ))}

          <g>
            {DESKTOP_IN.map((n, i) => (
              <g key={i}>
                <rect className="gnode" x="40" y={n.y} width="150" height="52" rx="10" />
                <text className="glabel" x="60" y={n.y + 22}>{inputs[i].label}</text>
                <text className="glabel-sub" x="60" y={n.y + 40}>{inputs[i].sub}</text>
              </g>
            ))}
          </g>

          <g>
            <circle className="gcore-ring" cx="550" cy="210" r="86">
              <animate attributeName="r" values="70;96" dur="2.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values=".35;0" dur="2.6s" repeatCount="indefinite" />
            </circle>
            <rect className="gnode-core" x="480" y="172" width="140" height="76" rx="14" />
            <circle cx="502" cy="196" r="4" fill="#2F6BFF" />
            <text className="glabel" x="514" y="200" fontWeight="500">Axantilo</text>
            <text className="glabel-sub" x="502" y="222">{coreSub[0]}</text>
            <text className="glabel-sub" x="502" y="236">{coreSub[1]}</text>
          </g>

          <g>
            {DESKTOP_OUT.map((n, i) => (
              <g key={i}>
                <rect className="gnode" x="880" y={n.y} width="170" height="52" rx="10" />
                <path className="gcheck" d={`M 900 ${n.y + 26} l 5 5 l 9 -10`} />
                <text className="gout" x="922" y={n.y + 23}>{outputs[i].label}</text>
                <text className="glabel-sub" x="922" y={n.y + 40}>{outputs[i].sub}</text>
              </g>
            ))}
          </g>

          {DESKTOP_PULSES.map((p, i) => (
            <circle key={i} className="gpulse" r="4">
              <animateMotion dur={p.dur} repeatCount="indefinite" begin={p.begin}>
                <mpath href={`#${idPrefix}-p${i + 1}`} />
              </animateMotion>
            </circle>
          ))}
        </svg>
      </div>

      {/* orchestration graph — mobile (kompakter Fan-in + Ergebnis-Leiste) */}
      <div className="graph-shell graph-shell--mobile rv rv-d4">
        <svg className="graph graph-mobile" viewBox="0 0 360 600" role="img" aria-label={ariaMobile}>
          {MOBILE_CHIPS.map((c, i) => (
            <path key={i} id={`${idPrefix}-m${i + 1}`} className="gpath" d={c.path} />
          ))}
          <path id={`${idPrefix}-ms`} className="gpath" d={MOBILE_SPINE} />
          {MOBILE_ROWS.map((y) => (
            <path key={y} className="gpath" d={`M 26 ${y + 27} L 40 ${y + 27}`} />
          ))}

          <g>
            {MOBILE_CHIPS.map((c, i) => (
              <g key={i}>
                <rect className="gnode" x={c.x} y="10" width="78" height="36" rx="10" />
                <text className="gchip-label" x={c.cx} y="33" textAnchor="middle">
                  {inputs[i].label}
                </text>
              </g>
            ))}
          </g>

          <g>
            <circle className="gcore-ring" cx="180" cy="190" r="64">
              <animate attributeName="r" values="52;72" dur="2.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values=".35;0" dur="2.6s" repeatCount="indefinite" />
            </circle>
            <rect className="gnode-core" x="48" y="150" width="264" height="80" rx="14" />
            <circle cx="72" cy="182" r="4.5" fill="#2F6BFF" />
            <text className="glabel" x="86" y="187" fontWeight="500">Axantilo</text>
            <text className="glabel-sub" x="72" y="210">{`${coreSub[0]} ${coreSub[1]}`}</text>
          </g>

          <g>
            {MOBILE_ROWS.map((y, i) => (
              <g key={y}>
                <rect className="gnode" x="40" y={y} width="304" height="54" rx="12" />
                <path className="gcheck" d={`M 54 ${y + 26} l 5 5 l 9 -10`} />
                <text className="gout" x="80" y={y + 23}>{outputs[i].label}</text>
                <text className="glabel-sub" x="80" y={y + 41}>{outputs[i].sub}</text>
              </g>
            ))}
          </g>

          {MOBILE_CHIPS.map((_, i) => (
            <circle key={i} className="gpulse" r="4.5">
              <animateMotion dur="2.6s" repeatCount="indefinite" begin={`${i * 0.65}s`}>
                <mpath href={`#${idPrefix}-m${i + 1}`} />
              </animateMotion>
            </circle>
          ))}
          <circle className="gpulse" r="4.5">
            <animateMotion dur="3s" repeatCount="indefinite" begin="0.4s">
              <mpath href={`#${idPrefix}-ms`} />
            </animateMotion>
          </circle>
          <circle className="gpulse" r="4.5">
            <animateMotion dur="3s" repeatCount="indefinite" begin="1.9s">
              <mpath href={`#${idPrefix}-ms`} />
            </animateMotion>
          </circle>
        </svg>
      </div>
    </>
  );
}
