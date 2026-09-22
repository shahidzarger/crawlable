/**
 * The licence key on the customer's own device.
 *
 * There is no account system — the key is the credential — so it is kept in
 * localStorage and nowhere else. Every access is wrapped: private browsing,
 * blocked site data and some embedded webviews make `localStorage` throw on
 * read as well as write, and a thrown storage call must never take down the
 * page around it. A miss simply means the customer types the key again.
 *
 * Shared by the dashboard and the report page so both read and write the same
 * entry; two components with their own copy of this string is how a customer
 * ends up "signed in" on one page and not the other.
 */

export const LICENSE_STORAGE_KEY = 'crawlable.license';

export function readStoredLicenseKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LICENSE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeStoredLicenseKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) window.localStorage.setItem(LICENSE_STORAGE_KEY, key);
    else window.localStorage.removeItem(LICENSE_STORAGE_KEY);
  } catch {
    // Storage unavailable. The session still works; the key is just not remembered.
  }
}

/**
 * Fetch a generated file (or the whole kit) and hand it to the browser.
 *
 * The download endpoint authenticates by `Authorization` header, so it cannot
 * be reached with a plain link — a top-level navigation sends no custom
 * headers and would arrive unauthenticated. The request therefore goes through
 * fetch, and the response is turned into a blob and clicked programmatically.
 */
export async function downloadAuditFile(options: {
  auditId: string;
  licenseKey: string;
  /** A generated filename, or 'zip' for the whole kit. */
  file: string;
  siteUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { auditId, licenseKey, file, siteUrl } = options;
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '-');

  const query =
    file === 'zip' ? 'format=zip' : `file=${encodeURIComponent(file)}`;

  let response: Response;
  try {
    response = await fetch(`/api/audit/${auditId}/download?${query}`, {
      headers: { Authorization: `Bearer ${licenseKey}` },
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      error:
        payload?.error ??
        (response.status === 403
          ? 'That licence does not own this report.'
          : 'Download failed. Try again.'),
    };
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file === 'zip' ? `${host}-crawlable-fix-kit.zip` : `${host}-${file}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick; revoking synchronously races the click in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return { ok: true };
}
