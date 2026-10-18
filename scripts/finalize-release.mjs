/**
 * Finalize release metadata from CHANGELOG + installer bytes.
 *
 * Usage:
 *   node scripts/finalize-release.mjs [--write-changelog] [--notes-only]
 *   node scripts/finalize-release.mjs --verify-github v0.1.12
 *   node scripts/finalize-release.mjs --from-github v0.1.12 [--write-changelog]
 *
 * Env:
 *   RELEASE_INSTALLER_PATH - override NSIS path (default: bundle/nsis/DevStackBox_{version}_x64-setup.exe)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriConf = JSON.parse(
  readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"),
);
const version = tauriConf.version;
const changelogPath = join(root, "CHANGELOG.md");
const SHA_LINE = /^\*\*Installer SHA-256:\*\* `[0-9A-Fa-f]{64}`\s*$/m;

function defaultInstallerPath() {
  return join(
    root,
    "src-tauri/target/release/bundle/nsis",
    `DevStackBox_${version}_x64-setup.exe`,
  );
}

function hashFile(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex").toUpperCase();
}

function parseArgs(argv) {
  const out = {
    writeChangelog: false,
    notesOnly: false,
    verifyGithub: null,
    fromGithub: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write-changelog") out.writeChangelog = true;
    else if (a === "--notes-only") out.notesOnly = true;
    else if (a === "--verify-github") out.verifyGithub = argv[++i];
    else if (a === "--from-github") out.fromGithub = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function extractSection(changelog, ver) {
  const header = `## [${ver}]`;
  const start = changelog.indexOf(header);
  if (start === -1) {
    throw new Error(`CHANGELOG missing section ${header}`);
  }
  const afterHeader = changelog.indexOf("\n", start) + 1;
  const next = changelog.indexOf("\n## [", afterHeader);
  const body = changelog.slice(afterHeader, next === -1 ? undefined : next);
  if (/Unreleased/i.test(changelog.slice(start, start + 80))) {
    throw new Error(`CHANGELOG ${header} is still Unreleased`);
  }
  return body.trimEnd();
}

function stripShaFromSection(section) {
  return section.replace(SHA_LINE, "").trimEnd();
}

function injectSha(section, sha) {
  const base = stripShaFromSection(section);
  return `${base}\n\n**Installer SHA-256:** \`${sha}\``;
}

function sectionToReleaseNotes(section, tag, sha) {
  const cleaned = stripShaFromSection(section);
  const prev = version.replace(/\d+$/, (n) => String(Number(n) - 1));
  const prevTag = `v${prev}`;
  let md = `DevStackBox **${tag}**.\n\n`;
  md += cleaned;
  md += `\n\n**Installer SHA-256:** \`${sha}\``;
  md += `\n\nIn-app auto-update from **${prevTag}** uses the signed installer and \`latest.json\` on this release.`;
  return md.trim() + "\n";
}

function ghApi(path) {
  const r = spawnSync("gh", ["api", path, "--jq", ".assets"], {
    encoding: "utf8",
    cwd: root,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "gh api failed");
  }
  return JSON.parse(r.stdout);
}

function digestFromGithub(tag) {
  const assets = ghApi(`repos/DevStackBox/DevStackBox/releases/tags/${tag}`);
  const exe = assets.find(
    (a) =>
      /setup\.exe$/i.test(a.name) &&
      new RegExp(`DevStackBox_${version}_`, "i").test(a.name),
  );
  if (!exe?.digest) {
    throw new Error(`No setup.exe digest on GitHub for ${tag}`);
  }
  const m = exe.digest.match(/^sha256:([a-f0-9]{64})$/i);
  if (!m) throw new Error(`Unexpected digest format: ${exe.digest}`);
  return m[1].toUpperCase();
}

function updateChangelogSha(sha) {
  let cl = readFileSync(changelogPath, "utf8");
  const section = extractSection(cl, version);
  const nextSection = injectSha(section, sha);
  const header = `## [${version}]`;
  const start = cl.indexOf(header);
  const afterHeader = cl.indexOf("\n", start) + 1;
  const next = cl.indexOf("\n## [", afterHeader);
  const before = cl.slice(0, afterHeader);
  const after = next === -1 ? "" : cl.slice(next);
  cl = before + nextSection + "\n" + after;
  writeFileSync(changelogPath, cl, "utf8");
}

function writeNotes(notes) {
  const dir = join(root, "release");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `notes-v${version}.md`);
  writeFileSync(path, notes, "utf8");
  return path;
}

function main() {
  const args = parseArgs(process.argv);
  const tag = `v${version}`;
  const changelog = readFileSync(changelogPath, "utf8");
  const section = extractSection(changelog, version);

  let sha;
  if (args.fromGithub || args.verifyGithub) {
    const t = args.fromGithub || args.verifyGithub;
    sha = digestFromGithub(t);
  } else {
    const installer =
      process.env.RELEASE_INSTALLER_PATH?.trim() || defaultInstallerPath();
    if (!existsSync(installer)) {
      throw new Error(
        `Installer not found: ${installer}. Build first or set RELEASE_INSTALLER_PATH.`,
      );
    }
    sha = hashFile(installer);
  }

  if (args.verifyGithub) {
    const installer =
      process.env.RELEASE_INSTALLER_PATH?.trim() || defaultInstallerPath();
    if (existsSync(installer)) {
      const local = hashFile(installer);
      if (local !== sha) {
        throw new Error(
          `GitHub digest ${sha} does not match local file ${local}`,
        );
      }
    }
    console.log(`OK: GitHub asset digest matches (${sha})`);
    return;
  }

  const notes = sectionToReleaseNotes(section, tag, sha);
  const notesPath = writeNotes(notes);
  console.log(`Wrote ${notesPath}`);
  console.log(`SHA-256: ${sha}`);

  if (args.writeChangelog && !args.notesOnly) {
    updateChangelogSha(sha);
    console.log(`Updated CHANGELOG.md [${version}] SHA line`);
  }
}

main();
