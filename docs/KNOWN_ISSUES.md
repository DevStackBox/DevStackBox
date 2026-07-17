# DevStackBox - Known Issues and Technical Debt

Single source of truth for open bugs, release blockers, and technical debt that should be considered before adding new features.

Read this before coding. Fix critical and high-priority issues before feature work unless the feature is required to resolve the issue.

---

## Priority Levels

- CRITICAL - Causes crashes, data loss, or completely broken features.
- HIGH - Blocks release quality, distribution, updates, or important workflows.
- MEDIUM - Works with limitations or has a known workaround.
- LOW - Minor cleanup, documentation, or polish.

---

## Critical Issues

No open critical issues.

---

## High Priority Issues

### ISSUE-011: Auto-Updater Signing Keys Not Configured

**Priority:** HIGH
**Files:** `src-tauri/tauri.conf.json`, GitHub repository secrets
**Status:** Keys generated; GitHub Secrets still need the private key pasted in

**Description:**
`tauri-plugin-updater` is installed, `auto-updater.tsx` is wired up, and `tauri.conf.json` points to the GitHub Releases `latest.json` endpoint.

**Work done:**

- Key pair generated with `pnpm tauri signer generate --ci`.
- Private key saved to `%USERPROFILE%\.tauri\devstackbox.key` (local machine, not committed).
- Public key updated in `src-tauri/tauri.conf.json`.
- Local build signing configured via the `TAURI_SIGNING_PRIVATE_KEY_PATH` user env var.
- Workflow updated to use Tauri v2 env var names: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

**Remaining step:**
Paste the private key content into GitHub repository secrets:

1. Go to `https://github.com/DevStackBox/DevStackBox/settings/secrets/actions`.
2. Add secret `TAURI_SIGNING_PRIVATE_KEY` - value is the full content of `%USERPROFILE%\.tauri\devstackbox.key`.
3. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can be left empty (key has no password).
4. Do not commit the private key file or paste it anywhere in the repo.

---

### ISSUE-016: Clean Installer Smoke Test Still Pending

**Priority:** HIGH
**Files:** `src-tauri/tauri.conf.json`, installer bundle output, bundled `apache/`, `php/`, `mysql/`, `phpmyadmin/`
**Status:** Release verification pending

**Description:**
The development workspace is working, but the MSI and NSIS installers still need clean-machine validation before v0.1.7 can be treated as release-ready.

**Required checks:**

1. Install on a clean Windows 11 machine or VM.
2. Verify Apache, PHP 8.3, MySQL, and phpMyAdmin work with no internet access.
3. Verify user data is created under `%LOCALAPPDATA%\DevStackBox\`.
4. Verify app updates do not touch `www/`, `mysql-data/`, `logs/`, `config/`, or `backups/`.
5. Test both `C:\dsb` and `C:\Program Files\DevStackBox` install paths.

---

### ISSUE-017: `cargo clippy -D warnings` Fails on Current Toolchain

**Priority:** HIGH
**Files:** `src-tauri/src/commands/terminal.rs`, `src-tauri/src/utils/paths.rs`
**Status:** RESOLVED

**Description:**
`cargo check` passes, but `cargo clippy --all-targets -- -D warnings` failed under the current Rust toolchain because clippy reported two warnings as errors:

1. `TerminalSessions::new()` lacked a matching `Default` implementation.
2. `utils::paths` manually stripped the `\\?\` prefix instead of using `strip_prefix`.

**Fix applied:**

1. Added `impl Default for TerminalSessions { fn default() -> Self { Self::new() } }` in `terminal.rs`.
2. Replaced manual prefix slicing with `raw.strip_prefix(r"\\?\")` in `paths.rs`.
3. `cargo clippy --all-targets -- -D warnings` now passes cleanly.

---

## Medium Priority Issues

### ISSUE-015: phpMyAdmin 5.2.1 PHP 8.4 Compatibility

**Priority:** MEDIUM
**Files:** `phpmyadmin/vendor/thecodingmachine/safe/`, `src-tauri/src/commands/php.rs`
**Status:** Mitigated by ini patch; not fully resolved

**Description:**
phpMyAdmin 5.2.1 bundles `thecodingmachine/safe`, which emits many PHP 8.4 `E_DEPRECATED` notices for implicitly nullable parameters. Under CGI mode these notices previously flooded Apache logs, slowed phpMyAdmin, and could corrupt CGI headers when `html_errors` was enabled.

**Current mitigation in `patch_php_ini()`:**

- `error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT`
- `html_errors = Off`
- `session.sid_length` and `session.sid_bits_per_character` are commented out for PHP 8.4 startup compatibility.

**Permanent fix:**
Upgrade bundled phpMyAdmin to 5.2.2 or later.

---

## Low Priority Issues

### ISSUE-014: First-Run www Seed Must Be Present in Installer

**Priority:** LOW
**File:** `src-tauri/src/commands/apache.rs`
**Status:** Partially mitigated

**Description:**
`seed_www_dir` copies default files from the installed `www/` directory to the user data `www/` directory on first run. If the installer ever omits the source `www/` seed files, Apache can fall back to an empty document root and show a directory listing.

**Fix:**
During installer verification, confirm the bundled `www/` seed files are present and copied into `%LOCALAPPDATA%\DevStackBox\www\` on first launch.

---

## Fixed Issues Reference

| Issue                                                         | Fix                                                                                | Version    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| MSI version format `0.1.0-alpha.6` broke MSI                  | Changed to clean semver                                                            | v0.1.6     |
| `globals.css` accidentally deleted                            | Restored                                                                           | v0.1.6     |
| `main.tsx` accidentally deleted                               | Restored                                                                           | v0.1.6     |
| GitHub Actions emoji encoding broke PowerShell                | Removed emoji from workflow files                                                  | v0.1.6     |
| Duplicate `ServiceStatus` type in 3 files                     | Consolidated to `src/types/services.ts`                                            | v0.1.6     |
| Apache `get_apache_status` missing from Rust                  | Added command                                                                      | v0.1.6     |
| Config management commands missing                            | Added config commands                                                              | v0.1.6     |
| `service_manager.rs` dead code                                | Deleted                                                                            | v0.1.6     |
| `lib.rs` was too large                                        | Split into `commands/`, `utils/`, and `types.rs`                                   | v0.1.6     |
| Service status had multiple sources of truth                  | Removed status globals; status uses OS process checks                              | v0.1.6     |
| `switch_php_version` could not call `mklink` directly         | Uses `cmd /C mklink /J`                                                            | v0.1.6     |
| Dev-machine path used as production fallback                  | Removed `C:\xampp\htdocs\DevStackBox` from production fallback paths               | v0.1.6     |
| `DebugPanel` visible in production                            | Guarded behind development mode                                                    | v0.1.6     |
| Raw frontend command strings                                  | Centralized in `src/lib/commands.ts`; no raw `safeInvoke("...")` matches found     | v0.1.7-dev |
| localhost 500 on PHP 8.4 due to `session.sid_*` deprecations  | `patch_php_ini()` comments out deprecated directives                               | v0.1.7-dev |
| phpMyAdmin timeout or 500 on PHP 8.4 due to deprecation flood | `patch_php_ini()` sets compatible `error_reporting` and disables `html_errors`     | v0.1.7-dev |
| localhost and phpMyAdmin broke after adding a vhost           | configVersion 7 template keeps localhost VirtualHost and phpMyAdmin Alias together | v0.1.7-dev |
