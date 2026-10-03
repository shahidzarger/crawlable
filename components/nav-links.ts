/**
 * The main navigation, in display order. The desktop header and the mobile
 * menu both render from this list, so the two can never offer different
 * links. Dashboard is not here: it is the header's button, rendered
 * separately in each.
 */
export const NAV_LINKS: readonly { href: string; label: string }[] = [
  { href: '/ai-crawlers', label: 'AI crawlers' },
  { href: '/platforms', label: 'Platforms' },
  { href: '/blog', label: 'Blog' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
];
