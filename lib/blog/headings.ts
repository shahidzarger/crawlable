import GithubSlugger from 'github-slugger';
import type { Element, ElementContent, Root, RootContent } from 'hast';

/**
 * Heading ids and the table of contents, produced in one pass.
 *
 * The ids on the rendered headings and the hrefs in the table of contents have
 * to agree exactly, or the sticky ToC links to nowhere. Generating both from
 * the same tree walk, with the same slugger instance, is what guarantees it —
 * a separate regex over the Markdown source would disagree the first time a
 * heading contained inline code, a link or a duplicate title.
 *
 * Slugs follow GitHub's algorithm (github-slugger), so a heading's anchor is
 * the same here as in the repo's own Markdown preview, and repeats get -1, -2.
 */

export interface TocEntry {
  depth: 2 | 3;
  text: string;
  id: string;
}

/** Thrown for structural problems in a post body, so the build names the post. */
export class PostStructureError extends Error {}

function textOf(node: ElementContent | RootContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) {
    return (node.children as ElementContent[]).map(textOf).join('');
  }
  return '';
}

function walk(node: Root | Element, visit: (element: Element) => void): void {
  for (const child of node.children) {
    if (child.type === 'element') {
      visit(child);
      walk(child, visit);
    }
  }
}

/**
 * Rehype plugin: assign ids to h2/h3 and collect them into `toc`.
 *
 * `toc` is filled in place rather than returned through vfile data so the
 * caller gets a typed array without casting `file.data`.
 *
 * An <h1> in the body is rejected: the page template renders the post title
 * as the only h1, and a second one splits the document outline that both
 * screen readers and extraction pipelines use to find the main topic.
 */
export function rehypeHeadings(options: { toc: TocEntry[] }) {
  return (tree: Root) => {
    const slugger = new GithubSlugger();

    walk(tree, (element) => {
      if (element.tagName === 'h1') {
        throw new PostStructureError(
          'Post bodies must not contain an h1 ("# Heading"); the title is the page h1. Start sections at "##".',
        );
      }
      if (element.tagName !== 'h2' && element.tagName !== 'h3') return;

      const text = element.children.map(textOf).join('').trim();
      const id = slugger.slug(text);
      element.properties = { ...element.properties, id };
      options.toc.push({ depth: element.tagName === 'h2' ? 2 : 3, text, id });
    });
  };
}
