#!/usr/bin/env node
/**
 * Validates DevStackBox documentation for CI.
 * Run: node scripts/validate-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const docsDir = path.join(root, "docs");

const { allDocSlugs } = await import(
  pathToFileURL(path.join(docsDir, "navigation.ts")).href
);

const SKIP_DIRS = new Set(["archive", "images", "assets", "standards"]);
const errors = [];

function walkMdx(dir, base = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMdx(full, rel));
    } else if (entry.name.endsWith(".mdx")) {
      files.push({ rel, full });
    }
  }
  return files;
}

function slugFromMdxPath(rel) {
  return rel.replace(/\.mdx$/, "").replace(/\\/g, "/");
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fm[m[1]] = value;
  }
  return fm;
}

function resolveDocLink(fromSlug, href) {
  if (
    !href ||
    href.startsWith("http") ||
    href.startsWith("#") ||
    href.startsWith("mailto:")
  ) {
    return null;
  }
  const clean = href.split("#")[0].split("?")[0];
  if (!clean || clean.endsWith(".png") || clean.endsWith(".jpg")) return null;

  const fromDir = fromSlug.includes("/")
    ? path.dirname(fromSlug.replace(/\//g, path.sep))
    : ".";

  let target = clean.replace(/\.mdx$/, "").replace(/\.md$/, "");
  if (target.startsWith("./")) target = target.slice(2);
  if (target.startsWith("../")) {
    const parts = fromDir.split(path.sep).filter(Boolean);
    const segments = target.split("/");
    for (const seg of segments) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    target = parts.join("/");
  } else if (!target.startsWith("docs/")) {
    const joined =
      fromDir === "." ? target : path.join(fromDir, target).replace(/\\/g, "/");
    target = joined;
  } else {
    target = target.replace(/^docs\//, "");
  }

  return target.replace(/\\/g, "/");
}

const mdxFiles = walkMdx(docsDir);
const slugSet = new Set(allDocSlugs);
const fileSlugs = new Set(mdxFiles.map((f) => slugFromMdxPath(f.rel)));

for (const { rel, full } of mdxFiles) {
  const slug = slugFromMdxPath(rel);
  const content = fs.readFileSync(full, "utf8");
  const relPath = `docs/${rel.replace(/\\/g, "/")}`;

  const fm = parseFrontmatter(content);
  if (!fm) {
    errors.push(`${relPath}: missing or invalid YAML frontmatter`);
  } else {
    if (!fm.title) errors.push(`${relPath}: frontmatter missing 'title'`);
    if (!fm.description)
      errors.push(`${relPath}: frontmatter missing 'description'`);
  }

  if (content.includes("<!--")) {
    errors.push(`${relPath}: HTML comments are not allowed in MDX`);
  }

  const imageRefs = content.match(/!\[[^\]]*\]\(([^)]+)\)/g) ?? [];
  for (const ref of imageRefs) {
    const src = ref.match(/\(([^)]+)\)/)?.[1];
    if (src && !src.startsWith("http")) {
      const imgPath = path.resolve(path.dirname(full), src);
      if (!fs.existsSync(imgPath)) {
        errors.push(`${relPath}: missing image ${src}`);
      }
    }
  }

  const mdLinks = [...content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)];
  for (const [, href] of mdLinks) {
    if (/\.md(?:x)?(?:[#?]|$)/i.test(href) && !href.startsWith("http")) {
      const resolved = resolveDocLink(slug, href);
      if (resolved !== null) {
        const asMdx = path.join(docsDir, `${resolved}.mdx`);
        const asMd = path.join(docsDir, `${resolved}.md`);
        if (!fs.existsSync(asMdx) && !fs.existsSync(asMd)) {
          errors.push(
            `${relPath}: dead doc link "${href}" (resolved to docs/${resolved}.mdx)`,
          );
        }
        if (href.endsWith(".md") || href.includes(".md#")) {
          errors.push(
            `${relPath}: stale .md link "${href}" - use MDX slug paths without .md extension`,
          );
        }
      }
    }
  }
}

for (const slug of allDocSlugs) {
  const fileSlug = slug === "" ? "index" : slug;
  const mdxPath = path.join(docsDir, `${fileSlug}.mdx`);
  if (!fs.existsSync(mdxPath)) {
    errors.push(
      `navigation.ts: slug "${slug}" has no docs/${fileSlug}.mdx file`,
    );
  }
}

for (const slug of fileSlugs) {
  if (!slugSet.has(slug) && slug !== "index") {
    errors.push(
      `docs/${slug}.mdx is not listed in navigation.ts (orphan page)`,
    );
  }
}

if (errors.length > 0) {
  console.error("Documentation validation failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `Documentation OK (${mdxFiles.length} MDX files, ${allDocSlugs.length} nav slugs).`,
);
