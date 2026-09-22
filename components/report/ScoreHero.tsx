import { scoreColor, scoreVerdict } from './severity';

/**
 * The headline. One number, stated once, at a size that makes it the first
 * thing read — not a gauge, because a gauge encodes a single value in an arc
 * that is harder to read than the digits themselves.
 */
export function ScoreHero({
  score,
  grade,
  invisiblePercent,
  pagesAudited,
  pagesSkipped = 0,
  siteUrl,
}: {
  score: number;
  grade: string;
  invisiblePercent: number;
  pagesAudited: number;
  /** Targets dropped when the audit hit its time budget. */
  pagesSkipped?: number;
  siteUrl: string;
}) {
  const host = siteUrl.replace(/^https?:\/\//, '');
  const color = scoreColor(score);

  return (
    <div className="surface-card p-6 sm:p-8">
      {/*
        Shown above the number, never below it. A score derived from a sample
        that looks identical to a complete one is the single most damaging
        thing this report could do, so the caveat has to arrive before the
        figure it qualifies.
      */}
      {pagesSkipped > 0 && (
        <div
          role="status"
          className="mb-5 rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--data-warn)' }}
        >
          <p className="font-medium">
            <span aria-hidden style={{ color: 'var(--data-warn)' }}>
              ◆
            </span>{' '}
            Partial scan — {pagesAudited}{' '}
            {pagesAudited === 1 ? 'page' : 'pages'} analysed before the time limit
          </p>
          <p className="mt-1 ink-secondary">
            {pagesSkipped} further {pagesSkipped === 1 ? 'page was' : 'pages were'} found
            but not fetched, because {host} responded slowly. The score below reflects the
            pages we did read. Re-run the audit for fuller coverage — it will not cost
            another credit if you contact support.
          </p>
        </div>
      )}

      <p className="text-sm ink-muted">AI readability of</p>
      <p className="mt-0.5 break-all font-mono text-sm">{host}</p>

      <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className="text-6xl font-semibold leading-none tracking-tight tabular-nums sm:text-7xl"
              style={{ color }}
            >
              {score}
            </span>
            <span className="text-2xl ink-muted">/100</span>
          </div>
          <p className="mt-2 text-sm ink-secondary">
            Grade {grade} · {scoreVerdict(score)}
          </p>
        </div>
      </div>

      <div className="mt-6" role="img" aria-label={`Score ${score} out of 100`}>
        <div className="data-track">
          <div className="data-fill" style={{ width: `${score}%`, background: color }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] ink-muted tabular-nums">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Invisible to AI crawlers"
          value={`${invisiblePercent}%`}
          tone={invisiblePercent > 0 ? 'bad' : 'good'}
          note={invisiblePercent > 0 ? 'of audited pages' : 'every page readable'}
        />
        <StatTile label="Pages audited" value={String(pagesAudited)} note="raw HTML only" />
        <StatTile
          label="Grade"
          value={grade}
          note={score >= 75 ? 'above the fixable line' : 'below the fixable line'}
        />
      </dl>
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'good' | 'bad';
}) {
  const color =
    tone === 'bad'
      ? 'var(--data-bad)'
      : tone === 'good'
        ? 'var(--data-good)'
        : 'var(--ink-primary)';

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: 'var(--surface-sunken)' }}
    >
      <dt className="text-[11px] uppercase tracking-wider ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-[11px] ink-muted">{note}</p> : null}
    </div>
  );
}
