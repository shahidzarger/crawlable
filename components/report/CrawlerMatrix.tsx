import type { CrawlerAccess } from '@/lib/audit/types';
import { SEVERITY } from './severity';

/**
 * Per-crawler access table.
 *
 * The distinction this table exists to draw: blocking a training crawler is a
 * licensing decision with no visibility cost, while blocking a retrieval
 * crawler removes you from answers users see. Sorting puts the expensive
 * blocks at the top.
 */
export function CrawlerMatrix({ access }: { access: CrawlerAccess[] }) {
  const sorted = [...access].sort((a, b) => {
    const cost = (item: CrawlerAccess): number =>
      !item.allowed && item.crawler.blockingCostsVisibility ? 0 : item.allowed ? 2 : 1;
    return cost(a) - cost(b);
  });

  return (
    <section className="surface-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight">AI crawler access</h2>
      <p className="mt-1 text-sm ink-secondary">
        What your robots.txt permits, per crawler. Retrieval and user-action crawlers decide
        whether you can be cited; training crawlers only decide whether your content is used
        for model training.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider ink-muted">
              <th className="border-b py-2 pr-4 font-medium">Crawler</th>
              <th className="border-b py-2 pr-4 font-medium">Operator</th>
              <th className="border-b py-2 pr-4 font-medium">Purpose</th>
              <th className="border-b py-2 font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const costly = !item.allowed && item.crawler.blockingCostsVisibility;
              const style = item.allowed
                ? SEVERITY.pass
                : costly
                  ? SEVERITY.critical
                  : SEVERITY.info;

              return (
                <tr key={item.crawler.token}>
                  <td className="border-b py-2.5 pr-4 font-mono text-xs">
                    {item.crawler.token}
                  </td>
                  <td className="border-b py-2.5 pr-4 ink-secondary">
                    {item.crawler.operator}
                  </td>
                  <td className="border-b py-2.5 pr-4 ink-secondary">
                    {item.crawler.purpose === 'training'
                      ? 'Training'
                      : item.crawler.purpose === 'search-index'
                        ? 'Search index'
                        : 'User action'}
                  </td>
                  <td className="border-b py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: style.color }}
                    >
                      <span aria-hidden>{style.icon}</span>
                      {item.allowed ? 'Allowed' : 'Blocked'}
                    </span>
                    {!item.allowed && !item.explicit ? (
                      <span className="ml-2 text-[11px] ink-muted">via User-agent: *</span>
                    ) : null}
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
