import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start px-4 py-24">
      <p className="font-mono text-sm ink-muted">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Nothing here for a crawler either
      </h1>
      <p className="mt-3 leading-relaxed ink-secondary">
        This page does not exist. If you followed a report link, it may have been for a scan
        that has since been removed.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn-primary px-5 py-2.5 text-sm">
          Back home
        </Link>
        <Link href="/#scan" className="btn-ghost px-5 py-2.5 text-sm">
          Run a free scan
        </Link>
      </div>
    </div>
  );
}
