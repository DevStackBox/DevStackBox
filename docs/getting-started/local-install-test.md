# Test the v0.1.17 installer locally

Build and finalize using the release runbook. Test this exact file in a disposable Windows test environment:

`src-tauri\target\release\bundle\nsis\DevStackBox_0.1.17_x64-setup.exe`

1. Back up projects and databases. Test both a clean installation and an in-place upgrade from v0.1.16; do not uninstall your working environment to simulate an upgrade.
2. Verify the installer checksum and updater signature. Follow your Windows security policy for publisher warnings; do not disable protections.
3. About must show 0.1.17. Start Apache and MySQL; verify localhost and phpMyAdmin.
4. Open a Laravel site served from public/ with .htaccess also in its parent. Verify a real route and static asset on HTTP and HTTPS. Confirm private parent files are inaccessible.
5. Verify the timestamped Apache configuration backup, custom ports/settings and saved projects. Restart again and check no duplicate baseline appears.
6. Check a plain PHP site, a root-level rewrite site and a pinned PHP runtime. Confirm the PHP terminal still uses global PHP.
7. Check the log viewer's path and fresh error entries. Test the updater from the previous installed release after publication.

Run the installed checker against the test installation:

```powershell
.\scripts\test-installed.ps1 -InstallRoot C:\devstackbox -State Running -ReportPath v0.1.17-installed-report.json
```

Record evidence in docs/RELEASE-VALIDATION.md. Cleanup candidates are listed separately in docs/development/v0.1.17-docs-audit.md; no runtime data or release evidence should be removed automatically.
