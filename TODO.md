# DevStackBox TODO

## ARCH-001: C:\DevStackBox Install Architecture

Priority: HIGH
Status: APPROVED (team review complete, 8.5/10)

### Goal

Switch installer default path from LOCALAPPDATA to C:\DevStackBox (XAMPP-style).
Keep all mutable user data (configs, logs, SSL, MySQL databases) in LOCALAPPDATA.
Move only www\ to C:\DevStackBox\www\ for developer discoverability.

### Architecture after this change

| What                                              | Path                                    |
| ------------------------------------------------- | --------------------------------------- |
| App binaries, Apache, MySQL bins, PHP, phpMyAdmin | C:\DevStackBox\                         |
| Web root                                          | C:\DevStackBox\www\                     |
| MySQL database data                               | %LOCALAPPDATA%\DevStackBox\mysql-data\  |
| Configs, logs, SSL, backups, state                | %LOCALAPPDATA%\DevStackBox\             |

### Files to change

**1. src-tauri/tauri.conf.json**

- NSIS installerMode: "perMachine" (UAC required to write C:\ root)
- NSIS installPath: "C:\\DevStackBox"
- NSIS postInstallSection: IF needed after testing, grant write access to BUILTIN\Users (NOT Everyone).
  First test WITHOUT any icacls - C:\DevStackBox outside Program Files may already be writable
  by the creating user. Only add ACL modification if standard-user writes to www\ fail.
- bundle.resources: ADD ../apache/\*_/_ (critical, currently missing from installer)
- bundle.resources: REMOVE ../config/\*_/_ (dev-path templates, never read at runtime)
- bundle.resources: KEEP ../www/\*_/_ (seeded into C:\DevStackBox\www\ by installer)

**2. src-tauri/wix/custom-install-dir.wxs**

- Replace all 3 occurrences of C:\dsb\ with C:\DevStackBox\

**3. src-tauri/src/utils/paths.rs**

- user_www_dir(): return get_installation_path().join("www") instead of get_user_data_root().join("www")
- Update file header comment to document the three-location model
- Fallback order already correct (C:\DevStackBox is already first)

**4. src-tauri/src/commands/apache.rs**

- seed_www_dir(): simplify since source and destination are now the same directory.
  New logic: if C:\DevStackBox\www\ is empty, write the embedded fallback index.html. Otherwise do nothing.

### Verification steps

Fresh install:

1. pnpm tauri build succeeds (with signing key set)
2. Run NSIS installer, UAC prompt appears, default path is C:\DevStackBox
3. After install, C:\DevStackBox\www\ is writable by a STANDARD USER without UAC (no elevated prompt)
   - Test: open cmd as normal user, create a file in C:\DevStackBox\www\ - must succeed
   - Test: npm install, composer create-project, git clone inside C:\DevStackBox\www\ - must succeed
4. Launch app, %LOCALAPPDATA%\DevStackBox\config\ is created (NOT C:\DevStackBox\config\)
5. Start Apache, httpd.conf is in %LOCALAPPDATA%\DevStackBox\config\, DocumentRoot = C:\DevStackBox\www\
6. http://localhost serves from C:\DevStackBox\www\
7. Start MySQL, datadir = %LOCALAPPDATA%\DevStackBox\mysql-data\
8. Uninstall via Settings > Apps, C:\DevStackBox is removed, LOCALAPPDATA data preserved

Upgrade path (CRITICAL - more important than clean install): 9. Install v0.1.6 first, start Apache + MySQL, create a file in www\, create a vhost 10. Install v0.1.7 over it 11. Verify: configs in LOCALAPPDATA are preserved (not overwritten) 12. Verify: MySQL data is preserved 13. Verify: SSL certs preserved 14. Verify: user files in www\ preserved 15. Verify: app launches and all services start normally after upgrade

### Blocking before auto-update goes public

- CRITICAL: NSIS upgrade script must explicitly skip C:\DevStackBox\www\ during updates.
  www\ contains user projects. The updater must never touch it.
  If updater complexity grows, consider moving www\ outside the install root in a future version.

### Out of scope (future tasks)

- Sidebar restructuring and route-based navigation
- Settings page cleanup (app behavior only, not service configs)
- Security page as actionable assistant
- Projects feature (after routing and services stabilize)

---

## RELEASE-001: Publish v0.1.7 to GitHub

Priority: HIGH
Status: READY (build complete, latest.json generated)

Files to upload to https://github.com/ProgrammerNomad/DevStackBox/releases/new?tag=v0.1.7

1. src-tauri/target/release/bundle/nsis/DevStackBox_0.1.7_x64-setup.exe
2. src-tauri/target/release/bundle/nsis/DevStackBox_0.1.7_x64-setup.exe.sig
3. src-tauri/target/release/bundle/msi/DevStackBox_0.1.7_x64_en-US.msi
4. src-tauri/target/release/bundle/msi/DevStackBox_0.1.7_x64_en-US.msi.sig
5. release/latest.json

Note: Create the v0.1.7 tag directly on GitHub. Do NOT push a git tag from local.
Note: Must publish (not draft) for the updater endpoint to resolve correctly.

### Release checklist

- [ ] Fresh install tested (NSIS installer)
- [ ] App launches without errors
- [ ] Apache starts and stops cleanly
- [ ] MySQL starts and stops cleanly
- [ ] http://localhost loads
- [ ] http://localhost/phpmyadmin loads
- [ ] SSL page works (or fails gracefully)
- [ ] Vhosts page works
- [ ] Logs viewer shows output
- [ ] Upgrade from v0.1.6 tested (configs/data/www preserved)
- [ ] Uninstall tested (LOCALAPPDATA data preserved)
- [ ] Updater endpoint resolves (latest.json reachable after publish)
- [ ] release published (not draft)

---
