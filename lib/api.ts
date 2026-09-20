import { NextResponse } from 'next/server';
import { store } from '@/lib/db';
import type { LicenseRecord } from '@/lib/db/types';
import { hashLicenseKey, validateLicenseKey } from '@/lib/lemonsqueezy';

/** Shared helpers for route handlers: responses, rate limiting and license auth. */

export interface ApiErrorBody {
  error: string;
  code: string;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export function fail(
  code: string,
  message: string,
  status = 400,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Best-effort client identity for rate limiting.
 * On Vercel, x-forwarded-for is set by the platform and cannot be spoofed past
 * the edge; elsewhere it is advisory, which is acceptable for this purpose.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse<ApiErrorBody> | null> {
  const db = await store();
  const allowed = await db.rateLimit(`${scope}:${clientIp(request)}`, limit, windowSeconds);
  if (allowed) return null;

  return NextResponse.json(
    {
      error: `Too many requests. Try again in a few minutes, or run unlimited audits with a license.`,
      code: 'rate-limited',
    },
    { status: 429, headers: { 'Retry-After': String(windowSeconds) } },
  );
}

export interface AuthedLicense {
  license: LicenseRecord;
  keyHash: string;
}

/**
 * Authenticate a request by license key.
 *
 * The key is checked against the local record first. A key that is valid at
 * Lemon Squeezy but not yet recorded locally — which happens when a customer
 * arrives before the webhook lands — is provisioned on the spot so a paying
 * customer is never turned away by a race.
 */
export async function authenticateLicense(
  request: Request,
): Promise<{ auth: AuthedLicense } | { response: NextResponse<ApiErrorBody> }> {
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const key = bearer || (request.headers.get('x-license-key') ?? '').trim();

  if (!key) {
    return {
      response: fail('missing-license', 'A license key is required for this endpoint.', 401),
    };
  }

  const keyHash = hashLicenseKey(key);
  const db = await store();
  const existing = await db.getLicense(keyHash);

  if (existing) {
    if (existing.status !== 'active') {
      return {
        response: fail(
          'license-inactive',
          `This license is ${existing.status}. Renew or buy a new one to keep auditing.`,
          403,
        ),
      };
    }
    return { auth: { license: existing, keyHash } };
  }

  // Not recorded locally — ask Lemon Squeezy directly.
  const validation = await validateLicenseKey(key);
  if (!validation.valid) {
    return {
      response: fail(
        'license-invalid',
        validation.error ?? 'That license key was not recognised.',
        403,
      ),
    };
  }

  const { provisionLicenseFromValidation } = await import('@/lib/licensing');
  const provisioned = await provisionLicenseFromValidation(key, validation);

  if (!provisioned) {
    return {
      response: fail(
        'license-unmapped',
        'That key is valid but does not map to a known plan. Contact support.',
        403,
      ),
    };
  }

  return { auth: { license: provisioned, keyHash } };
}

/** Parse and validate a JSON body, returning a typed error response on failure. */
export async function readJson<T>(
  request: Request,
): Promise<{ body: unknown } | { response: NextResponse<ApiErrorBody> }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { response: fail('bad-content-type', 'Expected application/json.', 415) };
  }
  try {
    return { body: (await request.json()) as T };
  } catch {
    return { response: fail('bad-json', 'Request body is not valid JSON.', 400) };
  }
}
