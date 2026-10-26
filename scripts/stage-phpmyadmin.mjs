import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const policy = JSON.parse(fs.readFileSync(path.join(root, "packaging/phpmyadmin-policy.json"), "utf8"));
const hash = data => createHash("sha256").update(data).digest("hex");
export function exclusion(relative) {
  if (relative.split("/").some(p => p === ".." || !p) || relative.includes("\\") || path.isAbsolute(relative)) throw new Error(`Unsafe path: ${relative}`);
  return policy.excludedFiles[relative] ?? Object.entries(policy.excludedDirectories)
    .find(([dir]) => relative.startsWith(dir + "/"))?.[1];
}
function files(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    const relative = prefix + entry.name;
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error(`Links are not allowed in the payload: ${absolute}`);
    if (entry.isDirectory()) return files(absolute, relative + "/");
    if (!entry.isFile()) throw new Error(`Unsupported file: ${absolute}`);
    return [relative];
  });
}
function assertDirectory(directory) {
  if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw new Error(`Expected ordinary directory: ${directory}`);
}
export function verifyStage(directory) {
  assertDirectory(directory);
  for (const file of files(directory)) if (exclusion(file)) throw new Error(`Excluded file in payload: ${file}`);
  for (const file of policy.requiredFiles) if (!fs.statSync(path.join(directory, file)).isFile()) throw new Error(`Missing required phpMyAdmin file: ${file}`);
  const themes = fs.readdirSync(path.join(directory, "themes"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  if (themes.length !== 1 || themes[0] !== policy.theme) throw new Error(`Unexpected theme directories: ${themes.join(", ")}. Review the policy for upstream changes.`);
  const config = fs.readFileSync(path.join(directory, "config.inc.php"), "utf8");
  if (!config.includes("$cfg['ThemeDefault'] = 'pmahomme';") || !config.includes("$cfg['ThemeManager'] = false;")) throw new Error("Single-theme configuration missing");
}
export function stagePhpMyAdmin(repo = root) {
  const source = path.join(repo, "phpmyadmin");
  const parent = path.join(repo, "packaging");
  assertDirectory(parent);
  assertDirectory(source);
  const destination = path.join(parent, "phpmyadmin-runtime");
  // Never clean arbitrary input paths. Only replace this fixed, generated directory.
  if (fs.existsSync(destination)) { assertDirectory(destination); files(destination); }
  const temporary = fs.mkdtempSync(path.join(parent, ".phpmyadmin-stage-"));
  const report = { schemaVersion: 1, policySha256: hash(JSON.stringify(policy)), sourceFiles: 0, sourceBytes: 0, excluded: [], retained: [] };
  try {
    for (const relative of files(source)) {
      const data = fs.readFileSync(path.join(source, relative));
      report.sourceFiles++;
      report.sourceBytes += data.length;
      const reason = exclusion(relative);
      if (reason) { report.excluded.push({ path: relative, bytes: data.length, sha256: hash(data), reason }); continue; }
      // Always use the repository template, not a developer's runtime credentials/configuration.
      const output = relative === "config.inc.php" ? fs.readFileSync(path.join(repo, "config/phpmyadmin.config.inc.php")) : data;
      const target = path.join(temporary, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, output);
      report.retained.push({ path: relative, bytes: output.length, sha256: hash(output), generated: relative === "config.inc.php" });
    }
    const themePolicy = fs.readFileSync(path.join(repo, "config/phpmyadmin-theme.inc.php"));
    fs.writeFileSync(path.join(temporary, "devstackbox-theme.inc.php"), themePolicy);
    report.retained.push({ path: "devstackbox-theme.inc.php", bytes: themePolicy.length, sha256: hash(themePolicy), generated: true });
    verifyStage(temporary);
    for (const entry of report.retained) if (hash(fs.readFileSync(path.join(temporary, entry.path))) !== entry.sha256) throw new Error(`Copy verification failed: ${entry.path}`);
    const previous = path.join(parent, ".phpmyadmin-previous-" + randomUUID());
    if (fs.existsSync(destination)) fs.renameSync(destination, previous);
    try { fs.renameSync(temporary, destination); }
    catch (error) { if (fs.existsSync(previous)) fs.renameSync(previous, destination); throw error; }
    if (fs.existsSync(previous)) fs.rmSync(previous, { recursive: true });
    fs.writeFileSync(path.join(parent, "phpmyadmin-report.json"), JSON.stringify(report, null, 2) + "\n");
    const saved = report.excluded.reduce((total, entry) => total + entry.bytes, 0);
    console.log(`phpMyAdmin staged: ${report.retained.length}/${report.sourceFiles} files; excluded ${report.excluded.length} files (${(saved / 1048576).toFixed(2)} MiB).`);
    return report;
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--repo-root")) throw new Error("Usage: stage-phpmyadmin.mjs [--repo-root directory]");
  stagePhpMyAdmin(args.length ? path.resolve(args[1]) : root);
}
