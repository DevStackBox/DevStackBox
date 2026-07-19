/**
 * Single source of truth for documentation sidebar and site footer links.
 * Update this file in the same PR when adding or removing doc pages.
 */

export type NavItem = {
  title: string;
  slug: string;
  children?: NavItem[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const docsNav: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Overview", slug: "" },
      { title: "Installation", slug: "getting-started/installation" },
      { title: "Upgrading", slug: "getting-started/upgrading" },
    ],
  },
  {
    title: "Advanced",
    items: [
      { title: "Environment", slug: "advanced/environment" },
      { title: "Troubleshooting", slug: "advanced/troubleshooting" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Configuration", slug: "reference/configuration" },
      { title: "Commands", slug: "reference/commands" },
      { title: "Installer", slug: "reference/installer" },
    ],
  },
  {
    title: "Development",
    items: [
      { title: "Building", slug: "development/building" },
      { title: "Architecture", slug: "development/architecture" },
      { title: "Components", slug: "development/components" },
      { title: "Coding Standards", slug: "development/coding-standards" },
      { title: "Release Process", slug: "development/release-process" },
      { title: "Testing", slug: "development/testing" },
      {
        title: "Architecture Decisions",
        slug: "development/adr/index",
        children: [
          { title: "ADR Index", slug: "development/adr/index" },
          { title: "001 - Use Tauri", slug: "development/adr/001-use-tauri" },
          {
            title: "002 - Tailwind + shadcn",
            slug: "development/adr/002-use-tailwind-shadcn",
          },
          { title: "003 - No Redux", slug: "development/adr/003-no-redux" },
          {
            title: "004 - Polling over events",
            slug: "development/adr/004-polling-over-events",
          },
          {
            title: "005 - PHP-first scope",
            slug: "development/adr/005-php-first-scope",
          },
          {
            title: "006 - App/data separation",
            slug: "development/adr/006-app-data-separation",
          },
        ],
      },
    ],
  },
  {
    title: "Project",
    items: [
      { title: "Roadmap", slug: "roadmap" },
      { title: "Feature Status", slug: "feature-status" },
      { title: "FAQ", slug: "faq" },
    ],
  },
];

export const siteHeaderNav = [
  { label: "Download", href: "/download" },
  { label: "Docs", href: "/docs" },
  { label: "Releases", href: "/releases" },
  { label: "Community", href: "/community" },
] as const;

export const siteFooterNav = {
  documentation: [
    { label: "Documentation", href: "/docs" },
    { label: "Download", href: "/download" },
    { label: "Releases", href: "/releases" },
    { label: "Roadmap", href: "/roadmap" },
    { label: "Changelog", href: "/changelog" },
    { label: "FAQ", href: "/faq" },
  ],
  community: [
    {
      label: "GitHub",
      href: "https://github.com/DevStackBox/DevStackBox",
      external: true,
    },
    {
      label: "Contributing",
      href: "https://github.com/DevStackBox/DevStackBox/blob/main/CONTRIBUTING.md",
      external: true,
    },
    { label: "Code of Conduct", href: "/community#code-of-conduct" },
  ],
  legal: [
    { label: "License", href: "/license" },
    { label: "Privacy", href: "/privacy" },
    { label: "Security", href: "/security" },
  ],
} as const;

/** Flat ordered list of doc slugs for prev/next navigation and orphan checks. */
export function flattenDocSlugs(sections: NavSection[] = docsNav): string[] {
  const slugs: string[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children) {
        for (const child of item.children) {
          slugs.push(child.slug);
        }
      } else {
        slugs.push(item.slug);
      }
    }
  }
  return slugs;
}

export const allDocSlugs = flattenDocSlugs();
