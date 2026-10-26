import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { policy, exclusion, stagePhpMyAdmin, verifyStage } from "./stage-phpmyadmin.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

test("exclusions are narrow and keep runtime assets, translations and licenses", () => {
  assert.ok(exclusion("themes/metro/css/theme.css"));
  assert.ok(exclusion("tmp/twig/cache.php"));
  for (const file of ["themes/dot.gif", "themes/pmahomme/scss/_variables.scss", "js/vendor/a.js.map", "vendor/package/LICENSE", "vendor/package/src/runtime.php", "locale/ar/LC_MESSAGES/phpmyadmin.mo", "doc/html/index.html"]) assert.equal(exclusion(file), undefined);
  assert.throws(() => exclusion("../outside"));
});

test("upgrade cleanup removes only known unchanged files and preserves custom content and caches", { skip: process.platform !== "win32" }, () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-pma-prune-test-"));
  const put = (relative, text) => { const file = path.join(repo, "phpmyadmin", relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  try {
    put("themes/metro/original.txt", "original");
    put("themes/metro/modified.txt", "user edited");
    put("themes/metro/custom.txt", "custom");
    put("tmp/cache.php", "runtime");
    put("config.inc.php", "private config");
    const digest = text => createHash("sha256").update(text).digest("hex");
    const manifest = path.join(repo, "report.json");
    fs.writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, excluded: [
      { path: "themes/metro/original.txt", sha256: digest("original") },
      { path: "themes/metro/modified.txt", sha256: digest("original") },
      { path: "tmp/cache.php", sha256: digest("runtime") },
      { path: "config.inc.php", sha256: digest("private config") },
    ] }));
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "src-tauri/nsis/prune-phpmyadmin.ps1", "-InstallRoot", repo, "-Manifest", manifest], { windowsHide: true });
    assert.equal(fs.existsSync(path.join(repo, "phpmyadmin/themes/metro/original.txt")), false);
    for (const file of ["themes/metro/modified.txt", "themes/metro/custom.txt", "tmp/cache.php", "config.inc.php"]) assert.ok(fs.existsSync(path.join(repo, "phpmyadmin", file)));
  } finally { fs.rmSync(repo, { recursive: true }); }
});

test("staging preserves source and bytes, replaces stale generated files, and fails before replacing good output", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-pma-test-"));
  const put = (file, data) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), data); };
  try {
    fs.mkdirSync(path.join(repo, "packaging"));
    for (const file of policy.requiredFiles) if (file !== "devstackbox-theme.inc.php") put("phpmyadmin/" + file, "fixture: " + file);
    put("phpmyadmin/themes/metro/unused.css", "excluded");
    put("phpmyadmin/vendor/notice/LICENSE", "keep exact bytes\r\n");
    put("config/phpmyadmin.config.inc.php", "<?php\n$cfg['ThemeDefault'] = 'pmahomme';\n$cfg['ThemeManager'] = false;\n");
    put("config/phpmyadmin-theme.inc.php", "<?php // policy\n");
    const report = stagePhpMyAdmin(repo);
    assert.equal(report.excluded.length, 1);
    assert.equal(fs.readFileSync(path.join(repo, "phpmyadmin/config.inc.php"), "utf8"), "fixture: config.inc.php");
    assert.equal(fs.readFileSync(path.join(repo, "packaging/phpmyadmin-runtime/vendor/notice/LICENSE"), "utf8"), "keep exact bytes\r\n");
    put("packaging/phpmyadmin-runtime/obsolete.txt", "old");
    stagePhpMyAdmin(repo);
    assert.equal(fs.existsSync(path.join(repo, "packaging/phpmyadmin-runtime/obsolete.txt")), false);
    put("phpmyadmin/themes/new-upstream-theme/theme.json", "{}");
    assert.throws(() => stagePhpMyAdmin(repo), /Unexpected theme/);
    verifyStage(path.join(repo, "packaging/phpmyadmin-runtime"));
  } finally { fs.rmSync(repo, { recursive: true }); }
});
