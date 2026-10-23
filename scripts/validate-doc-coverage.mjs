import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export function validateDocCoverage(root) {
  const coverage = JSON.parse(fs.readFileSync(path.join(root, "docs/coverage.json"), "utf8"));
  const metadata = fs.readFileSync(path.join(root, "src/lib/routes.ts"), "utf8");
  const declared = new Set([...metadata.matchAll(/path:\s*"([^"]+)"/g)].map(m => m[1]));
  const source = ts.createSourceFile("App.tsx", fs.readFileSync(path.join(root, "src/App.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node, parent = "") {
    let current = parent;
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening?.tagName.getText(source) === "Route") {
      const attr = opening.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === "path");
      if (attr?.initializer && ts.isStringLiteral(attr.initializer)) {
        const value = attr.initializer.text;
        current = value.startsWith("/") || value === "*" ? value : `${parent}/${value}`;
        declared.add(current);
      }
    }
    ts.forEachChild(node, child => visit(child, current));
  }
  visit(source);
  const records = new Map(coverage.screens.map(item => [item.route, item]));
  if (records.size !== coverage.screens.length) throw new Error("Duplicate documentation screen mapping");
  for (const redirect of coverage.redirects) {
    if (!declared.delete(redirect)) throw new Error(`Stale documented redirect: ${redirect}`);
  }
  for (const route of declared) if (!records.has(route)) throw new Error(`Screen needs a documentation decision: ${route}`);
  for (const { route, guide } of coverage.screens) {
    if (!declared.has(route)) throw new Error(`Stale documentation screen: ${route}`);
    if (!fs.existsSync(path.join(root, "docs", `${guide}.mdx`))) throw new Error(`Missing guide: ${guide}`);
  }
  for (const guide of Object.values(coverage.flows)) {
    if (!fs.existsSync(path.join(root, "docs", `${guide}.mdx`))) throw new Error(`Missing flow guide: ${guide}`);
  }
  console.log(`Coverage OK (${records.size} screens, ${Object.keys(coverage.flows).length} non-route flows).`);
}
