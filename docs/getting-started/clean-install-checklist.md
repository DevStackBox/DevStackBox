# Clean install verification (Windows 10/11)

Run after a fresh install on a VM or test PC.

## Steps

1. Install from the latest GitHub release `.exe` (default path `C:\devstackbox`).
2. Start Apache and MySQL from the dashboard.
3. Open `http://localhost/` and `http://localhost/phpmyadmin/`.
4. In **Services → PHP → Versions**, download **8.4** or **8.5** and switch once; confirm `php --version` in the app terminal matches.
5. Run the automated script (PowerShell, as admin if services are running):

```powershell
.\scripts\test-installed.ps1 -InstallRoot C:\devstackbox -State Running -ReportPath clean-install-report.json
```

Record the report path and date in `docs/archive/QA-2026-10-17-release-gate.md` when accepting a release.
