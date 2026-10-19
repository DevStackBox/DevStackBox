import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = resolve(root, "node_modules/@tauri-apps/cli/tauri.js");

// Tauri expects the key contents, while local developer environments commonly
// store only its file path. Load it into this child process without printing it.
if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
  if (!keyPath || !existsSync(keyPath)) {
    console.error(
      "Release build requires TAURI_SIGNING_PRIVATE_KEY or a valid TAURI_SIGNING_PRIVATE_KEY_PATH.",
    );
    process.exit(1);
  }
  process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf8").trim();
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    console.error("The configured updater signing key file is empty.");
    process.exit(1);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [resolve(root, "scripts/verify-release.mjs")]);
run(process.execPath, [tauriCli, "build", "--ci"]);
run(process.execPath, [resolve(root, "scripts/verify-updater-artifact.mjs")]);
