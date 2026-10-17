# Try v0.1.11 locally (before GitHub release)

## Installer

After `scripts/release-build.ps1`:

`src-tauri\target\release\bundle\nsis\DevStackBox_0.1.11_x64-setup.exe`

(Same path under `D:\Websites\DevStackBox\` if that is your git root.)

## Quick test

1. Uninstall older DevStackBox or install over `C:\devstackbox`.
2. Run the setup exe (More info → Run anyway if SmartScreen appears).
3. Start Apache + MySQL; open `http://localhost/phpmyadmin/`.
4. **About** should show **0.1.11**; MySQL version **8.4.x**.
5. **Services → PHP → Versions** — download **8.4** or **8.5** and switch once.
6. **Settings → Import from XAMPP** — optional htdocs copy test.

## Automated check (after install)

```powershell
.\scripts\test-installed.ps1 -InstallRoot C:\devstackbox -State Running
```
