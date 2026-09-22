'use client';

import { useEffect, useState } from 'react';
import { downloadAuditFile, readStoredLicenseKey } from '@/lib/license-storage';

/**
 * The header action: one click to the whole kit, without scrolling.
 *
 * Renders nothing until it knows whether a key is stored, and nothing at all
 * if there isn't one — a disabled button at the top of a shared report is
 * noise to the client reading it, and the section lower down already explains
 * how to unlock the files.
 */
export function ReportActionBar({
  auditId,
  siteUrl,
}: {
  auditId: string;
  siteUrl: string;
}) {
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLicenseKey(readStoredLicenseKey());
  }, []);

  if (!licenseKey) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setBusy(true);
        void downloadAuditFile({ auditId, licenseKey, file: 'zip', siteUrl }).finally(() =>
          setBusy(false),
        );
      }}
      disabled={busy}
      className="btn-primary px-4 py-2 text-xs"
    >
      {busy ? 'Preparing…' : 'Download Fix Kit (.zip)'}
    </button>
  );
}
