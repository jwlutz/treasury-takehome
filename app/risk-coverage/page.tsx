import type { Metadata } from 'next';
import rc from '../../data/eval/risk-coverage.json';

export const metadata: Metadata = { title: 'Risk-coverage · label check' };

// precomputed by `bun run risk-coverage` (data/eval/risk-coverage.json). static, no runtime fetch.
export default function RiskCoverage() {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const op = rc.operatingPoint;
  const autoPct = Math.round(op.coverage * 100);
  const reviewPct = 100 - autoPct;

  // chart geometry: x = coverage (0..1), y = false-clear rate (0..yMax)
  const W = 660;
  const H = 300;
  const L = 54;
  const R = 18;
  const T = 18;
  const B = 46;
  const yMax = 0.02; // 2% headroom so the 1% budget line + the floor curve are both visible
  const xAt = (cov: number) => L + cov * (W - L - R);
  const yAt = (rate: number) => H - B - (Math.min(rate, yMax) / yMax) * (H - T - B);

  const points = [...rc.points].sort((a, b) => a.coverage - b.coverage);
  const curve = points.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.coverage).toFixed(1)} ${yAt(p.falseClearRate).toFixed(1)}`).join(' ');
  const budgetY = yAt(rc.target);
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const yTicks = [0, 0.01, 0.02];

  return (
    <main>
      <header>
        <h1>Risk-coverage</h1>
        <p>How much can we auto-decide while bounding the error that actually hurts: a false clear, waving through a noncompliant label. The curve sets the auto-clear cutoff from data instead of a guessed confidence number.</p>
      </header>

      <div className="rc-stats">
        <div className="rc-stat good">
          <b>{rc.falseClearsTotal}</b>
          <span>false clears on the set</span>
        </div>
        <div className="rc-stat good">
          <b>{autoPct}%</b>
          <span>auto-decided (cleared or rejected)</span>
        </div>
        <div className="rc-stat warn">
          <b>{reviewPct}%</b>
          <span>routed to a human</span>
        </div>
      </div>

      <div className="rc-op">
        to keep false clears under <b>{pct(rc.target)}</b>, auto-decide <b>{autoPct}%</b> of labels and send the other {reviewPct}% to review. on this set the false-clear rate is <b>0% at every cutoff</b>, so coverage is capped only by the {reviewPct}% the rules already flag as judgment calls.
      </div>

      <div className="rc-split" aria-hidden="true">
        <div className="auto" style={{ width: `${autoPct}%` }}>auto {autoPct}%</div>
        <div className="review" style={{ width: `${reviewPct}%` }}>review {reviewPct}%</div>
      </div>

      <svg className="rc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`risk-coverage curve: false-clear rate stays at 0% up to ${autoPct}% coverage, well under the ${pct(rc.target)} budget`}>
        {/* safe zone under the budget */}
        <rect x={L} y={budgetY} width={W - L - R} height={H - B - budgetY} fill="var(--approve-bg)" />
        {/* axes */}
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="var(--line-strong)" strokeWidth="1" />
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--line-strong)" strokeWidth="1" />
        {/* y ticks */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={L - 4} y1={yAt(t)} x2={W - R} y2={yAt(t)} stroke="var(--line)" strokeWidth="0.5" />
            <text x={L - 8} y={yAt(t) + 4} textAnchor="end" fontSize="12" fill="var(--ink-soft)">{pct(t)}</text>
          </g>
        ))}
        {/* x ticks */}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={xAt(t)} y={H - B + 18} textAnchor="middle" fontSize="12" fill="var(--ink-soft)">{pct(t)}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--ink-soft)">coverage (share auto-decided)</text>
        {/* budget line */}
        <line x1={L} y1={budgetY} x2={W - R} y2={budgetY} stroke="var(--reject-line)" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={W - R} y={budgetY - 6} textAnchor="end" fontSize="12" fill="var(--reject-ink)">{pct(rc.target)} false-clear budget</text>
        {/* the curve (false-clear rate vs coverage) sitting on the floor */}
        <path d={curve} fill="none" stroke="var(--approve-line)" strokeWidth="3" strokeLinecap="round" />
        {/* operating point */}
        <circle cx={xAt(op.coverage)} cy={yAt(op.falseClearRate)} r="5" fill="var(--approve-line)" stroke="#fff" strokeWidth="1.5" />
        <text x={xAt(op.coverage)} y={yAt(op.falseClearRate) - 10} textAnchor="middle" fontSize="12" fill="var(--approve-ink)" fontWeight="600">operating point</text>
      </svg>

      <p className="rc-note">
        method: run every fixture through the pipeline, then sweep a read-confidence cutoff. only auto-decide an approve/reject when the read clears the bar, otherwise route to a human. coverage is the share auto-decided; risk is the false-clear rate among them. the operating point is the most coverage that stays under the budget. regenerate with <code>bun run risk-coverage</code> (writes <code>data/eval/risk-coverage.json</code>), and see <code>docs/eval.md</code> for the full table.
      </p>
      <p className="rc-note">
        caveat: 24 crisp synthetic labels is a clean set with zero false clears, so the curve hugs the floor and the budget is never the binding constraint. the value is the framework: on a larger, noisier set the curve bends and this is exactly how you would pick the cutoff to bound the scary error.
      </p>
    </main>
  );
}
