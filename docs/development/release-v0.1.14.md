# v0.1.14 release handoff

The previous public release is v0.1.13. These source changes target v0.1.14 only. Build and publication are left to the maintainer. No release or tag was published during this work.

## Included

- Bundled PHP 8.3.36; official Windows archive SHA-256 `0606810ff8fc232406aaab677b760e06af93a63a366d33ff738d4ce90501dfa5`.
- PHP 8.2–8.5 only in the version manager. Existing PHP 8.1 files are not deleted, but the branch cannot be downloaded, activated, or newly assigned to projects. Migrate existing 8.1 project selections.
- Branch and full patch labels, verified same-branch updates, preserved php.ini, rollback on replacement failure, and security checks before Apache startup.
- Updated website stack copy, structured data, LLM summaries, and synced documentation. Deploy website changes alongside the release. Download assets continue to come from published GitHub releases.

## Validation completed

- 30 frontend tests, TypeScript checks, 36 Rust tests, 26 documentation pages, and bundled-runtime preflight passed.
- Desktop test upgraded an isolated PHP 8.3.31 installation to 8.3.36 and preserved the php.ini checksum.
- Isolated HTTP checks reported PHP 8.3.36, persisted sessions across requests, accepted POST data, loaded nine essential extensions, and rendered phpMyAdmin with HTTP 200.
- Release finalization was exercised in a disposable fixture; it verified signatures and generated matching updater and package metadata.
- Website: four tests, ESLint, the production build, and 39-page HTTP checks passed (headings, canonical links, internal links and anchors, assets, 404, sitemap, and search).
- The final source still needs a fresh signed installer and the installation/upgrade smoke checks in the release runbook. Intermediate builds predate the final PHP 8.1 removal and must not be published; they were moved out of the normal installer output directory into `review-artifacts/superseded-v0.1.14-build`.

## Final build and metadata

Run from the app repository in PowerShell:

```powershell
npm run check
cargo test --manifest-path src-tauri/Cargo.toml --lib
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = Join-Path $env:USERPROFILE '.tauri\devstackbox.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npm run build:release
npm run finalize-release
```

Finalization reads the exact signed installer and updates `latest.json`, `release/latest.json`, `release/notes-v0.1.14.md`, the changelog checksum, WinGet manifest, and Chocolatey version. Until then, published updater/package manifests retain their previous verified release values. Never relabel a previous signature or checksum as v0.1.14.

Run installer smoke tests before uploading `DevStackBox_0.1.14_x64-setup.exe`, its `.sig`, and `latest.json`. Use `release/notes-v0.1.14.md` for release notes. Follow the release runbook for publication and post-upload verification.

In the website repository, run `npm test`, `npm run lint`, and `npm run build` before deployment. Its preparation script syncs the app documentation and changelog, so rerun it after finalizing the installer checksum.
