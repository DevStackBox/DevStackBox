# DevStackBox TODO

Current focus: v0.1.7 release hardening, then Phase 4 installer and distribution verification.

Keep this file limited to active work. Completed feature status belongs in `docs/FEATURE_STATUS.md`; long-term order belongs in `docs/ROADMAP.md`.

## Guardrails

- Do not mix release-hardening work with new feature work.
- Do not change runtime code during release documentation or installer verification unless a validation step exposes a real blocker.
- Keep generated runtime data under `%LOCALAPPDATA%\DevStackBox\` and never under the install directory.
- Keep command names centralized in `src/lib/commands.ts`.
- Keep the sidebar to the canonical eight workspaces: Dashboard, Services, Databases, Logs, Terminal, Security, Settings, About.

## Immediate - v0.1.7 Release Hardening

- [ ] Confirm the current PHP 8.4 CGI, phpMyAdmin, and vhost fixes need no further source changes.
- [ ] Run `pnpm exec tsc --noEmit`.
- [ ] Run `cd src-tauri; cargo check`.
- [ ] Run `cd src-tauri; cargo clippy --all-targets -- -D warnings`.
- [ ] Smoke test `http://localhost/`.
- [ ] Smoke test `http://localhost/phpmyadmin/`.
- [ ] Smoke test one configured local virtual host, such as `http://new.test/`.
- [ ] Smoke test Apache and MySQL start-stop from the UI.
- [ ] Smoke test Apache and MySQL start-stop from the tray menu.
- [ ] Smoke test PHP version switching between 8.3 and 8.4, then re-check phpMyAdmin.
- [ ] Update `CHANGELOG.md` for v0.1.7.
- [ ] When ready to release, bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` together.
- [ ] Build installers with `pnpm tauri build`.

## Phase 4 - Installer and Distribution

- [ ] Install the MSI on a clean Windows 11 machine or VM.
- [ ] Verify Apache, PHP 8.3, MySQL, and phpMyAdmin are bundled and work with no internet access.
- [ ] Test install path `C:\dsb`.
- [ ] Test install path `C:\Program Files\DevStackBox`.
- [ ] Verify runtime config, logs, sessions, MySQL data, backups, and `www` are created under `%LOCALAPPDATA%\DevStackBox\`.
- [ ] Verify all expected binaries exist under the install directory after MSI install.
- [ ] Test clean install.
- [ ] Test upgrade install.
- [ ] Document known local conflicts such as IIS, another Apache, another MySQL, or XAMPP already using ports 80, 443, or 3306.

## Auto-Updater Enablement

- [ ] Generate Tauri updater signing keys.
- [ ] Add `TAURI_PRIVATE_KEY` to GitHub repository secrets.
- [ ] Add `TAURI_KEY_PASSWORD` to GitHub repository secrets.
- [ ] Confirm the updater endpoint in `src-tauri/tauri.conf.json` resolves to the GitHub Releases `latest.json`.
- [ ] Implement or verify pre-update service shutdown for Apache and MySQL.
- [ ] Implement or verify backup-before-update for user configs.
- [ ] Test update from v0.1.6 to v0.1.7 and verify user data is intact.

## Deferred Feature Work

- [ ] Add automatic fixes to applicable Security findings with a preview confirmation dialog.
- [ ] Add Composer support after deciding whether Composer is bundled or downloaded on demand.
- [ ] Upgrade bundled phpMyAdmin to 5.2.2 or later to remove the PHP 8.4 deprecation workaround.
- [ ] Replace log polling with Tauri Channel streaming when the release path is stable.
- [ ] Add one-click WordPress and Laravel installers after v0.2.0 distribution work is reliable.
