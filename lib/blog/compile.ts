import { compile, run } from '@mdx-js/mdx';
import type { MDXContent } from 'mdx/types';
import * as runtime from 'react/jsx-runtime';
import remarkGfm from 'remark-gfm';
import { rehypeHeadings, type TocEntry } from './headings';

/**
 * Compile one post body to a React component plus its table of contents.
 *
 * This runs at build time inside a server component, so no MDX compiler or
 * Markdown parser ships to the browser: readers receive plain HTML, which is
 * also exactly what a non-rendering AI crawler receives. A blog for a product
 * about raw-HTML readability that needed JavaScript to show its words would
 * be its own worst case study.
 *
 * GFM is on for tables, strikethrough and autolinks. Nothing else is: no raw
 * HTML passthrough beyond what MDX itself allows, and no syntax-highlighting
 * runtime.
 */
export interface CompiledPost {
  Content: MDXContent;
  toc: TocEntry[];
}

export async function compilePost(body: string, file = 'post'): Promise<CompiledPost> {
  const toc: TocEntry[] = [];

  let code: string;
  try {
    const compiled = await compile(body, {
      outputFormat: 'function-body',
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[rehypeHeadings, { toc }]],
    });
    code = String(compiled);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not compile ${file}: ${message}`);
  }

  const { default: Content } = await run(code, { ...runtime, baseUrl: import.meta.url });
  return { Content, toc };
}
