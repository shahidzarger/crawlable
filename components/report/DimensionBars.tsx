import type { CheckResult } from '@/lib/audit/types';
import { scoreColor } from './severity';

/**
 * Per-dimension scores as a horizontal bar list.
 *
 * One series, so no legend — the row label names each bar directly. Values are
 * labelled on every row because there are only seven of them and the exact
 * number is the point. Bars are thin, anchored to a common baseline, and share
 * one 0-100 scale so lengths are comparable.
 */
export function DimensionBars({ checks }: { checks: CheckResult[] }) {
  const scored = checks.filter((check) => check.weight > 0);

  return (
    <section className="surface-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight">Score by dimension</h2>
      <p className="mt-1 text-sm ink-secondary">
        Each dimension is scored out of 100 and weighted into the total. Raw-HTML readability
        carries the most weight because nothing else helps a crawler that cannot read the page.
      </p>

      <ul className="mt-6 space-y-5">
        {scored.map((check) => (
          <li key={check.id}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm font-medium">{check.label}</span>
              <span className="flex items-baseline gap-2 text-sm tabular-nums">
                <span className="font-semibold" style={{ color: scoreColor(check.score) }}>
                  {check.score}
                </span>
                <span className="text-[11px] ink-muted">weight {check.weight}%</span>
              </span>
            </div>

            <div
              className="mt-2 data-track"
              role="img"
              aria-label={`${check.label}: ${check.score} out of 100`}
            >
              <div
                className="data-fill"
                style={{ width: `${check.score}%`, background: scoreColor(check.score) }}
              />
            </div>

            <p className="mt-1.5 text-xs ink-secondary">{check.summary}</p>
          </li>
        ))}
      </ul>

      <details className="mt-6 text-sm">
        <summary className="cursor-pointer ink-secondary hover:text-[var(--ink-primary)]">
          View as a table
        </summary>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider ink-muted">
              <th className="border-b py-2 pr-4 font-medium">Dimension</th>
              <th className="border-b py-2 pr-4 text-right font-medium">Score</th>
              <th className="border-b py-2 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((check) => (
              <tr key={check.id}>
                <td className="border-b py-2 pr-4">{check.label}</td>
                <td className="border-b py-2 pr-4 text-right tabular-nums">{check.score}</td>
                <td className="border-b py-2 text-right tabular-nums">{check.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
