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
