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
