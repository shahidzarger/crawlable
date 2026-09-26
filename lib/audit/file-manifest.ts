import type { GeneratedFiles } from './types';

/**
 * The Fix Kit manifest: one description of what a kit contains.
 *
 * This exists because the same bug shipped twice. The archive, the per-file
 * download endpoint and the report UI each had their own list of the kit's
 * files, so adding sitemap.xml to the generators left the zip throwing on a
 * stale record and the UI showing four rows for a five-file kit. Three lists
 * of one truth is three chances to be wrong.
 *
 * Order is deployment order, which is the order FIXES.md instructs: robots
 * first because everything else is pointless while a crawler is blocked, and
 * FIXES.md last because it is the guide to the other four.
 */

export interface FixKitFile {
  /** Filename, and the key in GeneratedFiles. */
  name: keyof GeneratedFiles;
  /** What the report UI labels the row. */
  label: string;
  /** One line under the label, in the report UI. */
  blurb: string;
  /** Served on a single-file download. */
  contentType: string;
}

export const FIX_KIT_FILES: readonly FixKitFile[] = [
  {
    name: 'robots.txt',
    label: 'robots.txt',
    blurb: 'Retrieval crawlers allowed, your existing rules preserved',
    contentType: 'text/plain; charset=utf-8',
  },
  {
    name: 'sitemap.xml',
    label: 'sitemap.xml',
    blurb: 'Clean XML sitemap ready for Google Search Console and AI discovery',
    contentType: 'application/xml; charset=utf-8',
  },
  {
    name: 'llms.txt',
    label: 'llms.txt',
    blurb: 'Built from your real pages and sections',
    contentType: 'text/markdown; charset=utf-8',
  },
  {
    name: 'schema.jsonld',
    label: 'JSON-LD schema',
    blurb: 'Organization, WebSite and BreadcrumbList blocks',
    contentType: 'application/ld+json; charset=utf-8',
  },
  {
    name: 'FIXES.md',
    label: 'FIXES.md',
    blurb: 'Every finding, ordered by impact, with the affected URLs',
    contentType: 'text/markdown; charset=utf-8',
  },
] as const;

/** Every file a Fix Kit must contain, in deployment order. */
export const GENERATED_FILE_NAMES = FIX_KIT_FILES.map(
  (file) => file.name,
) as readonly (keyof GeneratedFiles)[];

export const FIX_KIT_CONTENT_TYPES = Object.fromEntries(
  FIX_KIT_FILES.map((file) => [file.name, file.contentType]),
) as Record<keyof GeneratedFiles, string>;

export function isGeneratedFileName(value: string): value is keyof GeneratedFiles {
  return value in FIX_KIT_CONTENT_TYPES;
}
