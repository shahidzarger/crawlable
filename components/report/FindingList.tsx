import type { Finding } from '@/lib/audit/types';
import { SEVERITY } from './severity';

/**
 * The fix list, ordered by what costs the most visibility.
 * Severity is carried by an icon, a word and a colour together.
 */
export function FindingList({
  findings,
  title = 'What to fix, in order',
  emptyMessage = 'Nothing to fix — every check passed.',
}: {
  findings: Finding[];
  title?: string;
  emptyMessage?: string;
}) {
  const actionable = findings.filter((item) => item.severity !== 'pass');
  const passing = findings.filter((item) => item.severity === 'pass');

  return (
    <section className="surface-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>

      {actionable.length === 0 ? (
        <p className="mt-3 text-sm ink-secondary">{emptyMessage}</p>
      ) : (
        <ol className="mt-6 space-y-6">
          {actionable.map((item, index) => (
            <FindingCard key={item.id} finding={item} index={index + 1} />
          ))}
        </ol>
      )}

      {passing.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm ink-secondary hover:text-[var(--ink-primary)]">
            {passing.length} check{passing.length === 1 ? '' : 's'} passed
          </summary>
          <ul className="mt-4 space-y-3">
            {passing.map((item) => (
              <li key={item.id} className="flex gap-3 text-sm">
                <span aria-hidden style={{ color: SEVERITY.pass.color }}>
                  {SEVERITY.pass.icon}
                </span>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-0.5 ink-secondary">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const style = SEVERITY[finding.severity];

  return (
    <li className="border-l-2 pl-4" style={{ borderColor: style.color }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs ink-muted tabular-nums">{index}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{
            color: style.color,
            background: 'color-mix(in srgb, var(--surface-sunken) 100%, transparent)',
          }}
        >
          <span aria-hidden>{style.icon}</span>
          {style.label}
        </span>
        <span className="text-[11px] ink-muted">{style.action}</span>
      </div>

      <h3 className="mt-2 font-medium leading-snug">{finding.title}</h3>
      <p className="mt-2 text-sm leading-relaxed ink-secondary">{finding.detail}</p>

      {finding.remedy ? (
        <p className="mt-3 text-sm leading-relaxed">
          <span className="font-medium">Fix: </span>
          <span className="ink-secondary">{finding.remedy}</span>
        </p>
      ) : null}

      {finding.affectedUrls.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs ink-muted hover:text-[var(--ink-secondary)]">
            {finding.affectedCount} affected page{finding.affectedCount === 1 ? '' : 's'}
            {finding.affectedCount > finding.affectedUrls.length
              ? ` (first ${finding.affectedUrls.length} shown)`
              : ''}
          </summary>
          <ul className="mt-2 space-y-1">
            {finding.affectedUrls.map((url) => (
              <li key={url} className="break-all font-mono text-xs ink-secondary">
                {url}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
