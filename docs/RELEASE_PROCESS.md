# DevStackBox - Release Process

**The exact checklist for every release. Follow this every time without shortcuts.**

---

## Release Types

| Type  | When                                | Example           |
| ----- | ----------------------------------- | ----------------- |
| Patch | Bug fix only, no new features       | `0.1.6` → `0.1.7` |
| Minor | New working feature added           | `0.1.6` → `0.2.0` |
| Major | Breaking changes or large milestone | `0.x.x` → `1.0.0` |

Version format: `X.Y.Z` - always clean semver. No hyphens, no pre-release text. (MSI requirement)

---

## Step 1 - Pre-Release Checks

Before changing any version number, verify:

- [ ] All Phase 1 items in `docs/ROADMAP.md` are complete for this milestone
- [ ] No CRITICAL issues in `docs/KNOWN_ISSUES.md` are newly introduced
- [ ] `cargo build` completes with zero errors
- [ ] `pnpm tauri build` completes with zero errors
- [ ] App starts and services can be started on a clean Windows test machine

---

## Step 2 - Version Bump

Change version in ALL THREE files at the same time:

### `package.json`

```json
{
  "version": "0.1.7"
}
```

### `src-tauri/Cargo.toml`

```toml
[package]
version = "0.1.7"
```

### `src-tauri/tauri.conf.json`

```json
{
  "version": "0.1.7"
}
```

Verify they match:

```bash
node -e "const p=require('./package.json'); console.log('package.json:', p.version)"
grep "^version" src-tauri/Cargo.toml
grep '"version"' src-tauri/tauri.conf.json
```

---

## Step 3 - Update CHANGELOG.md

Add an entry at the top:

```markdown
## v0.1.7 - 2026-MM-DD

### Fixed

- Description of bug fix

### Added

- Description of new feature

### Changed

- Description of change
```

Keep the format consistent. Do not delete old entries.

---

## Step 4 - Build Release

```bash
pnpm tauri build
```

Expected output files:

- `src-tauri/target/release/bundle/msi/DevStackBox_0.1.7_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.7_x64-setup.exe`

If the build fails:

1. Check `src-tauri/target/release/build/` for Rust errors
2. Check that all three version numbers match exactly
3. Check that no new emoji were added to `.github/workflows/*.yml`

---

## Step 5 - Smoke Tests

Run this checklist on the **MSI installer** (not dev mode) on a clean Windows 11 machine or VM:

**Installation:**

- [ ] MSI installs without errors
- [ ] App opens from Start Menu
- [ ] App opens without antivirus immediately blocking it

**MySQL:**

- [ ] MySQL starts successfully
- [ ] phpMyAdmin opens in browser
- [ ] MySQL stops successfully

**Apache:**

- [ ] Apache starts successfully
- [ ] `http://localhost` shows the www directory
- [ ] Apache stops successfully

**Config:**

- [ ] Config editor opens `php.ini`
- [ ] Config change is saved
- [ ] Config backup is created

**General:**

- [ ] Dark mode and light mode both work
- [ ] Language switcher works (EN and HI)
- [ ] Sidebar navigation loads all pages without errors

---

## Step 6 - Generate SHA-256 Hashes

Generate hashes for both installers (required for security transparency):

```powershell
Get-FileHash "src-tauri\target\release\bundle\msi\DevStackBox_0.1.7_x64_en-US.msi" -Algorithm SHA256
Get-FileHash "src-tauri\target\release\bundle\nsis\DevStackBox_0.1.7_x64-setup.exe" -Algorithm SHA256
```

Include these in the GitHub Release description.

---

## Step 7 - GitHub Release

1. Create a git tag:

   ```bash
   git tag v0.1.7
   git push origin v0.1.7
   ```

2. Go to [GitHub Releases](https://github.com/ProgrammerNomad/DevStackBox/releases/new)

3. Fill in:
   - **Tag:** `v0.1.7`
   - **Title:** `DevStackBox v0.1.7`
   - **Description:** Copy from CHANGELOG.md + paste SHA-256 hashes
   - **Attach files:** Both MSI and NSIS installers

4. Click Publish Release.

---

## Step 8 - Post-Release

- [ ] Verify the download links in the GitHub Release page work
- [ ] Update `README.md` version badge if necessary
- [ ] Close GitHub Issues that were fixed in this release
- [ ] Update `docs/FEATURE_STATUS.md` if feature status changed

---

## Auto-Updater (Phase 4 - Not Yet Active)

When the auto-updater is configured, an additional step will be needed:

1. Generate `latest.json` with new version info, download URLs, and signatures
2. Upload to the updater endpoint URL
3. Test that an older installation picks up the update

The updater flow is not active yet. See `docs/KNOWN_ISSUES.md` ISSUE-011.

---

## What Can Go Wrong

| Problem                             | Fix                                                          |
| ----------------------------------- | ------------------------------------------------------------ |
| MSI refuses to install              | Version has hyphens or letters - use clean semver only       |
| Build fails with "version mismatch" | One of the three version files is different                  |
| Antivirus blocks installer          | Publish SHA-256 hash - users can verify and allow            |
| GitHub Actions build fails          | Check for emoji in .yml files - see KNOWN_ISSUES.md          |
| MSI is larger than expected         | Check that `src-tauri/target/` was not accidentally included |
