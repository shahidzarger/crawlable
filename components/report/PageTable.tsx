import type { PageAnalysis } from '@/lib/audit/types';
import { SEVERITY } from './severity';

/** Per-page verdict: what a non-rendering crawler got from each URL. */
export function PageTable({ pages }: { pages: PageAnalysis[] }) {
  return (
    <section className="surface-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight">Page by page</h2>
      <p className="mt-1 text-sm ink-secondary">
        Word counts are measured on the raw HTML with scripts and styles stripped — the exact
        text a crawler that does not run JavaScript comes away with.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider ink-muted">
              <th className="border-b py-2 pr-4 font-medium">URL</th>
              <th className="border-b py-2 pr-4 text-right font-medium">Words</th>
              <th className="border-b py-2 pr-4 text-right font-medium">Text ratio</th>
              <th className="border-b py-2 pr-4 text-right font-medium">Schema</th>
              <th className="border-b py-2 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              const failed = page.error !== null;
              const invisible = failed || page.isSpaShell || page.rawWordCount < 100;
              const thin = !invisible && page.rawWordCount < 250;
              const style = invisible
                ? SEVERITY.critical
                : thin
                  ? SEVERITY.warning
                  : SEVERITY.pass;

              let path = page.url;
              try {
                path = new URL(page.url).pathname || '/';
              } catch {
                // Keep the full string when it will not parse.
              }

              return (
                <tr key={page.url}>
                  <td className="max-w-[260px] truncate border-b py-2.5 pr-4 font-mono text-xs">
                    <span title={page.url}>{path}</span>
                  </td>
                  <td className="border-b py-2.5 pr-4 text-right tabular-nums">
                    {failed ? '—' : page.rawWordCount.toLocaleString()}
                  </td>
                  <td className="border-b py-2.5 pr-4 text-right tabular-nums ink-secondary">
                    {failed ? '—' : `${(page.textToHtmlRatio * 100).toFixed(1)}%`}
                  </td>
                  <td className="border-b py-2.5 pr-4 text-right ink-secondary">
                    {failed ? '—' : page.schemaTypes.length > 0 ? page.schemaTypes.length : '0'}
                  </td>
                  <td className="border-b py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: style.color }}
                    >
                      <span aria-hidden>{style.icon}</span>
                      {failed
                        ? 'Fetch failed'
                        : page.isSpaShell
                          ? 'Empty shell'
                          : page.rawWordCount < 100
                            ? 'Nearly empty'
                            : thin
                              ? 'Thin'
                              : 'Readable'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
