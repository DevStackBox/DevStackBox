# Release validation history

## v0.1.17 qualification - 23 October 2026

- Final installer: `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.17_x64-setup.exe`, 187366159 bytes. SHA-256: `3128C4CAAAF8692E52E7A0EE68B7EF0ABF4FFBEC89FD224F505FF8B7AB0910AB`. Both updater signatures verified (`verify-updater-artifact.mjs`, `finalize-release`).
- Isolated Apache regression (`scripts/test-apache-overrides.mjs`): parent `.htaccess` ignored; public rewrites and assets work; private parent fixture inaccessible; paths with spaces covered.
- Automated validation: `pnpm run check` (42 frontend, docs, release inputs); 43 Rust tests; signed NSIS build completed.
- Not repeated in this pass: in-place upgrade from an installed v0.1.16 profile, or live Laravel project HTTP/HTTPS on a maintainer machine. Treat those as post-install checks if needed.
- Release metadata finalized: `latest.json`, WinGet template, changelog SHA, `release/notes-v0.1.17.md`.

v0.1.12 was published on 18 October 2026. Reports below preserve historical candidate evidence; the internal build numbers 0.1.13–0.1.15 predate that public release and are distinct from the subsequent public v0.1.13 patch.

## v0.1.13 qualification - 19 October 2026

- Final installer: `DevStackBox_0.1.13_x64-setup.exe`, 187160175 bytes. SHA-256: `C278038B57A0F4C7CDDAF7D38709E5DB03F3A05686EFF4D16BF2BCCBF17E1875`. Both updater signatures verified.
- GitHub Windows verification passed for code revision `2eb59ac`; release metadata is finalized separately.

- 27 frontend tests and 33 Rust library tests passed; TypeScript, documentation validation, release input verification and strict Clippy passed.
- The compiled app refused an orphan-host HTTPS update without changing saved/generated configurations or creating a CA.
- Upgrade-stop helper and compiled NSIS harness passed: only owned processes stopped; locked binaries blocked replacement; existing website backups and locked website folders were preserved; retries succeeded after unlocking. These used disposable fixtures, not the installed application.
- Website: 4 tests, ESLint, production build and the 39-page HTTP smoke passed. Website CI now excludes its nested app-source checkout from website linting.
- An independent Node verifier checks both the installer Minisign signature and its trusted comment against the configured updater public key.
- Windows Authenticode signing is pending. This release remains subject to Windows publisher/reputation warnings.
- Not repeated for this patch: clean-machine installer/UI qualification, manual upgrade and installed auto-update. The earlier isolated Apache reproduction was blocked by automatic approval review. Existing Laravel HTTP 500 and stale Apache logs are not claimed fixed.
- Historical reports below apply to their named artifacts, not automatically to v0.1.13.

## Public candidate preparation - 18 October 2026

Version manifests and changelog now identify v0.1.12. Previous reports below are historical evidence, not verification of this final artifact. Website: four tests, ESLint, production build, and 39-page HTTP smoke passed. App: 26 frontend tests, 29 Rust tests, and 26 documentation pages passed validation. The rebuilt orphan guard, owned-process/locked-file helper tests, and compiled NSIS replacement/website-preservation tests passed. The v0.1.12 integration harness passed simultaneous PHP 8.3/8.5 HTTP and HTTPS, versioned ini/extensions, missing-version rejection, persistence and reset isolation in a disposable profile. New website captures use the installed internal v0.1.15 build, explicitly captioned.

The release metadata generator now requires an exact version/architecture match and its paired signature, rejects an older signature, and uses a UTC timestamp.

Do not announce the candidate as publicly available until uploaded and final installer qualification is complete. Users of internal 0.1.13–0.1.15 builds need a manual install because semantic-version updaters do not offer a lower version automatically. Keep the installed internal build until the public candidate is tested; do not uninstall to work around upgrade failures.

### Final candidate artifact

- Version: 0.1.12 (built 18 October 2026).
- File: `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.12_x64-setup.exe`
- Size: 187052439 bytes.
- SHA-256: see [GitHub release v0.1.12](https://github.com/DevStackBox/DevStackBox/releases/tag/v0.1.12) asset digest (`E3F2F4CA76254F14DA52A02A17BC2B6FE9222C1861084CF0CE6172C849F292E3` as of publish).
- Updater artifact signature and signed comment independently verified against the configured public key.
- Matching `release/latest.json` generated; root `latest.json` synchronized as staged release metadata. Publish only alongside the matching artifact; do not deploy this feed ahead of the release.
- Windows Authenticode status: NotSigned. Updater signing is not Windows publisher signing.
- This final artifact has not been installed or published. Final installation and clean-machine qualification remain pending.
- Cleanup left one dummy metadata-test folder after automatic approval review blocked its recursive removal; no reason beyond blocked by policy was returned.

---

## Internal evidence: HTTPS-RELEASE-VALIDATION.md

# DevStackBox 0.1.12 validation - 18 October 2026

## Build and upgrade

- Windows x64 NSIS installer and updater signature generated successfully.
- Installer: `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.12_x64-setup.exe`
- Size: 187,098,690 bytes.
- SHA256: `326b1536801644b0fee2c37f6eb388d27b969fbdfc1a1bd9aa8bc7a49df9186c`
- Upgrade exercised at `C:\devstackbox`; installed product version is 0.1.12.
- SHA256 comparison against the pre-upgrade www manifest: zero existing project
  files changed or missing. Backup is under ignored `review-artifacts/upgrade-backup`.
- Installer automatically launched per-user localhost certificate setup. The user
  handled the Windows trust prompt. HTTPS enabled marker exists; no setup error
  was observed after completion.
- Installed localhost on port 443 returned HTTP 200 with normal Windows trust
  validation. The managed health endpoint returned the expected localhost marker
  `49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763`.

## Tests completed

- 21 frontend tests passed; TypeScript check passed.
- 24 Rust library tests passed.
- Production frontend/release build, documentation validation and release-input
  verification passed. Existing Vite chunk-size warnings remain.
- Isolated Windows integration run passed: trusted localhost and .test host,
  PHP execution, public document root containing spaces, phpMyAdmin isolation,
  invalid/reserved names, duplicate hostname, editing, occupied HTTPS-port
  rollback, damaged-key repair and profile restoration. Overlapping configuration
  operations were rejected by the shared lock.
- Chrome opened the isolated localhost HTTPS page without an interstitial.
  Final installed verification used Windows HTTPS requests because browser
  automation was disabled in Work settings at that point.
- Desktop Projects list and connection form reviewed; Escape cancellation checked.
- Temporary repository Apache stopped and isolated test CA trust removed.
  Installed localhost still returned HTTP 200 afterward.

## Remaining release qualification

This is a tested local build, not a claim that every planned acceptance case has
passed. Clean-machine install, alternate administrator credentials, multiple
Windows accounts, Firefox/managed-browser policy, offline WebView2 installation,
two independently mapped project hosts, rename/disable/remove permission denial,
full responsive/theme/language matrix, and automatic per-account uninstall trust
cleanup remain to qualify. CA removal instructions are in `docs/LOCAL-HTTPS.md`.
Handled-failure rollback is implemented; crash-proof durable transactions are not.
The updater signature is not Windows Authenticode publisher signing.

No public release, repository push, or website publication was performed.

---

## Internal evidence: PROJECTS-RELEASE-VALIDATION.md

# DevStackBox 0.1.13 local installer candidate

## Included

- Project details with full-page website editing, stable links through renames,
  folder access and a link to existing PHP management.
- Separate HTTPS trust and HTTP website response diagnostics, empty/missing root
  guidance and saved/generated Apache configuration warnings.
- HTTPS setup/renewal refuses to overwrite a generated site with no active saved
  record, before changing files or restarting Apache. Reconnect the existing folder
  from Projects after reviewing the configuration; this does not diagnose the
  original cause of the mismatch.
- AI/MCP integration is excluded. Per-project PHP/terminals, database linking,
  Git/SSH and on-demand framework recipes remain future work.

## Validation

- 29 Rust library tests passed, including the renewal preservation regression.
- 25 frontend tests, TypeScript and documentation validation passed.
- Frontend production build passed with existing size/mixed-import warnings.
- Installer inputs verified, including bundled mkcert checksum.
- Compiled release executable reports 0.1.13. The isolated
  `scripts/verify-project-upgrade-guard.ps1` check passed: orphan-site HTTPS setup
  exits with the expected error, saved/generated configuration hashes are unchanged,
  and no CA or HTTPS-enabled marker is created.
- Existing configuration files were copied without overwriting prior backups to
  `review-artifacts/0.1.13-preinstall-config` before packaging. No CA keys were copied.
- This build has not been installed over the user's 0.1.12 installation.
  Native visual review and clean-install/upgrade qualification remain pending.
- No public release or repository push. Updater signatures are distinct from
  Windows Authenticode publisher signing.

## Manual check after installation

1. Confirm About displays 0.1.13.
2. Open Projects. If the existing a.test mismatch appears, review the warning and
   connect the existing `C:\devstackbox\www\a` folder with hostname `a.test`.
3. Choose Manage project; check that editing opens on a full page.
4. Use Check health and compare Website response with HTTPS / SSL.
5. Save a hostname edit and confirm the same details page remains available.
6. Verify existing project files and databases remain available after upgrade.

## Final artifact

- Installer: `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.13_x64-setup.exe`
- Product version: 0.1.13; size: 187,108,516 bytes.
- SHA256: `cd716b24c958b976889fb9361e9b4fbd4a808871c6b6ef7a366691559df67a17`.
- Updater `.sig` and checksum `.sha256` accompany the installer. Signature and
  trusted-comment signature independently verified against the configured updater
  public key using Node's Ed25519 verification and BLAKE2b prehash.
- Windows Authenticode status: NotSigned.
- Final signed installer build succeeded on 18 October 2026. No installation was
  performed; installation testing is the next manual step.

---

## Internal evidence: UPGRADE-RELEASE-VALIDATION.md

# DevStackBox 0.1.14 manual-upgrade fix

## Cause and changes

The old NSIS process commands passed doubled single quotes to PowerShell, producing
parser errors. Process detection interpreted the error exit code as "not running";
the force-stop commands also had invalid quoting. A read-only reproduction against
the original generated command returned the PowerShell parser errors and exit 1.
The early wizard-page stop also ran before its maintenance executable was extracted.

The upgrade now runs a packaged PowerShell file from the installer temporary
directory, after closing the GUI and before copying application files. It attempts
graceful shutdown through the installed application, handles owned Windows services,
then stops remaining owned processes and verifies they have exited. Ownership uses
an exact installation-directory prefix with a separator; other installations are
not targeted. Live processes with unavailable paths cause an error, while processes
that exited during enumeration are ignored. Program EXE/DLL files must pass an
exclusive-open check before copying proceeds. Query, permission, shutdown and file
lock errors abort installation with a nonzero result and visible diagnostics.

The premature wizard-page stop and maintenance executable copy were removed.
Legacy uninstall/process snippets also received corrected quoting. Existing website
backup directories are no longer deleted on retry; a failed www preservation or
restoration aborts rather than continuing or scheduling deletion after reboot.

## Checks completed

- `scripts/test-upgrade-stop.ps1`: running process inside an installation with
  spaces stopped; same-name process in a sibling-prefix directory stayed running;
  locked DLL rejected without changing content; retry and fresh install passed.
- `scripts/test-nsis-upgrade-stop.ps1`: compiled the actual NSIS stop function and
  embedded helper; a locked DLL caused nonzero exit before a payload marker could
  be written; releasing the lock allowed the payload marker on retry.
- The compiled NSIS test also confirmed that an existing `_www_preserve` backup
  survives retry, a locked website folder aborts before payload writes, and backup
  succeeds once that lock is released.
- Ran the new helper against the actual `C:\devstackbox` installation. Apache and
  MySQL stopped, remaining GUI exited, and installed program files passed lock
  checks. A subsequent process query found no owned running app/web/database service.
- Existing installed files were not upgraded by these tests. Services were left
  stopped for the user's next installation attempt.

## Limits

The complete new installer has not yet been run through an upgrade. Multi-account
elevation, restrictive enterprise policies, reboot interruption, third-party programs
reopening files between check and copy, and website-backup recovery need further
qualification. No claim is made that a preflight check eliminates every possible
Windows file-lock race. No public release or repository push was performed.

## Final artifact

- `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.14_x64-setup.exe`
- Product version verified: 0.1.14. Size: 187,114,185 bytes.
- SHA256: `ab77e1becfbdc7933fd8d90f0da62f1d37b6f00e418674e351bb74c5237bc042`.
- Installer build and release-input validation succeeded. Updater artifact and
  trusted-comment signatures verified independently against the configured public
  key. Adjacent `.sig` and `.sha256` files are available.
- Production frontend build passed with the existing chunk-size/import warnings.
- Installer has not been publicly published or installed over the user's current
  copy. Windows Authenticode signing is still not configured.

---

## Internal evidence: PROJECT-PHP-VALIDATION.md

# DevStackBox 0.1.15 project PHP selection

## Included

- Projects and discovered folders display one item per row at all window sizes.
- Project rows show their pinned PHP version or the global-default setting.
- Project details lists only versions reported installed by PHP management, plus
  Use global default. Installing a version stays in the existing PHP Versions page.
- A project selection is persisted by stable project ID. Website edits preserve
  the selection. HTTP and HTTPS virtual hosts resolve the pinned executable directory
  directly, without changing the shared current junction or other projects.
- The backend rejects unsupported, missing/incomplete and invalid runtime installs.
  Applying uses the existing Apache validation/restart/rollback path.
- Pinning initially creates a per-version configuration at
  `config/php-runtimes/<version>/php.ini`, using that installed runtime's template,
  its extension directory, essential extensions, session directory and log path.
  Existing global php.ini customizations are not copied to pinned runtime configs.

## Validation

- 26 frontend tests passed, including hiding uninstalled versions, applying a
  project version without a global switch/download, and resetting to default.
- 29 Rust library tests passed; TypeScript and documentation checks passed.
- `cargo run --example project_php_smoke` passed in an isolated review profile:
  two concurrent virtual hosts served PHP 8.3 and 8.5 over both HTTP and HTTPS;
  loaded ini and extension directories matched the chosen branch; unsupported
  selection was rejected; selections persisted; changing the first site to 8.5
  changed its live response; resetting it restored 8.3 while the second stayed 8.5.
- Test PHP 8.5 was copied from the already downloaded installed runtime into the
  ignored development runtime folder. It is not added to the installer payload.
- Test TLS trust was confined to the HTTP client's certificate store. No Windows
  CA trust or hosts-file change was made. The test Apache process was stopped.
- Production frontend build succeeded with existing bundle/import warnings.

## Remaining scope

Project-aware terminals, per-version configuration/extension editing in the UI,
framework installers and the rest of the roadmap remain separate work. Terminals
currently use the global default; this release selects website PHP only. Native
visual review and installed upgrade testing remain pending. AI integration is excluded.

## Installer

- `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.15_x64-setup.exe`
- Size: 187,084,846 bytes.
- SHA256: `4012b3f81b380fb71a2f870474454f5f951707f968fa3fa52a56a34cc70cad42`.
- Release build succeeded. Updater artifact and trusted-comment signatures verified
  against the configured public key. Adjacent `.sig` and `.sha256` files are present.
- Generated installer resources were checked: PHP 8.5 and test-profile runtime
  configurations are not bundled. Windows publisher signing remains unconfigured.
- No installation or public release was performed during this change.
