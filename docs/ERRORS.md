# DevStackBox - Error Reference

**Every known error message, what it means, and how to fix it.**  
When you see an error in the UI or logs, find it here first.

---

## Service Errors

### `binary not found at <path>`

**Meaning:** DevStackBox cannot find the service executable.

**Cause:** The service binary is missing from the expected path, or the app is looking in the wrong directory.

**Fix:**

1. Open the Debug panel (dev builds only) - it shows what path was resolved
2. Check that `apache/bin/httpd.exe`, `mysql/bin/mysqld.exe`, or `php/8.3/php.exe` exist
3. If they are missing, re-run `scripts/prepare-binaries.ps1` or copy from your XAMPP installation
4. If the path looks wrong (pointing to `C:\xampp\htdocs\DevStackBox` in a production install), see `docs/KNOWN_ISSUES.md` ISSUE-009

---

### `Port 80 is not available`

**Meaning:** Something else is already using port 80.

**Fix:** See `docs/NETWORKING.md` section "Port 80 Already in Use"

---

### `Port 3306 is not available`

**Meaning:** MySQL cannot start because port 3306 is taken.

**Fix:** See `docs/NETWORKING.md` section "Port 3306 Already in Use"

---

### `Apache failed to start (exit code: 1)`

**Meaning:** Apache exited immediately after launch.

**Likely causes:**

1. Port 80 is in use (most common)
2. `httpd.conf` has a syntax error
3. A required module DLL is missing
4. 32-bit Apache binary on a 64-bit system (architecture mismatch)

**Diagnose:**

- Check `logs/error.log` for the specific Apache error
- Run manually to see output: `apache\bin\httpd.exe -t` (config test)

**Architecture mismatch fix:** See `docs/APACHE_64BIT_GUIDE.md`

---

### `MySQL failed to start`

**Meaning:** mysqld.exe exited immediately after launch.

**Likely causes:**

1. Port 3306 is in use
2. `mysql/data/` is corrupt or missing
3. `my.cnf` has invalid settings
4. A previous MySQL session left a lock file

**Diagnose:**

- Check `mysql/data/<hostname>.err` for the MySQL error log
- Look for `[ERROR]` lines

**Fix lock file:**

```powershell
Remove-Item "mysql\data\<hostname>.pid" -ErrorAction SilentlyContinue
```

---

### `MySQL stopped unexpectedly`

**Meaning:** MySQL was running and then disappeared without being stopped from the UI.

**Likely causes:**

1. Windows killed the process due to memory pressure
2. MySQL data directory corrupted
3. InnoDB crash recovery triggered and failed

**Fix:**

1. Check `mysql/data/<hostname>.err` for `[ERROR]` or `Shutdown` messages
2. If InnoDB crash recovery fails, restore from backup (`config-backups/`)
3. Restart MySQL - it usually recovers on its own

---

## Config Errors

### `Failed to read config file`

**Meaning:** DevStackBox cannot open the config file for reading.

**Likely cause:** File does not exist, or the app has no permission to read it.

**Fix:**

1. Verify the file exists at `config/php.ini` (or `config/httpd.conf`, `config/my.cnf`)
2. If missing, use "Restore Default" option in the Config Editor
3. If it exists, check file permissions

---

### `Failed to save config file`

**Meaning:** The config change could not be written to disk.

**Likely causes:**

1. File is read-only
2. App was installed to `C:\Program Files\` and lacks write permission without elevation
3. Antivirus is blocking the write

**Fix:**

1. Check file properties → uncheck "Read-only"
2. If installed to Program Files, run DevStackBox as Administrator (or reinstall to `C:\dsb`)
3. Check antivirus logs for blocked writes

---

### `Config backup failed`

**Meaning:** Could not create a backup in `config-backups/`.

**Fix:**

1. Check that `config-backups/` directory exists
2. Check disk space
3. Check write permissions on the `config-backups/` directory

---

## PHP Errors

### `PHP version switching failed`

**Meaning:** `switch_php_version` command could not create the directory junction.

**Likely causes:**

1. `cmd.exe` was not found (unusual, but possible in restricted environments)
2. Insufficient permissions to create directory junctions
3. Target PHP version not downloaded yet

**Fix:**

1. Verify the target version exists: `php\8.1\php.exe`
2. Run DevStackBox as Administrator if junction creation fails
3. Manually create the junction: `cmd /C mklink /J php\current php\8.1`

---

### `PHP binary not found`

**Meaning:** `php/8.3/php.exe` (or other version) does not exist.

**Fix:**

1. Use the PHP Version Selector to install the missing version
2. Note: PHP download is currently a stub - see `docs/KNOWN_ISSUES.md` ISSUE-003

---

## Installer Errors

### MSI error 1603 (Generic installation failure)

**Common causes:**

1. Previous installation not fully cleaned up
2. Missing VC++ Redistributable
3. Antivirus blocking installation

**Fix:**

1. Uninstall any previous DevStackBox version first
2. Install Microsoft Visual C++ Redistributable 2022 (x64)
3. Temporarily disable antivirus during install

See `docs/MSI_TROUBLESHOOTING.md` for more detail.

---

### `Cannot find the DevStackBox installation path`

**Meaning:** After MSI install, the app cannot find its own binary files.

**Cause:** MSI installed to an unexpected location, or the path fallback list does not include your install path.

**Fix:**

1. Check where the MSI installed: Start Menu → DevStackBox → right-click → "Open file location"
2. Verify `apache/`, `mysql/`, `php/` directories are in that folder
3. If not, re-run the installer and choose the default path

---

## UI / Frontend Errors

### Blank page or white screen on startup

**Meaning:** React app failed to load.

**Fix:**

1. Open DevTools (`Ctrl+Shift+I`)
2. Check the Console tab for JavaScript errors
3. Common cause: missing asset file - re-run `pnpm install && pnpm tauri build`

---

### `Unknown command: <command_name>`

**Meaning:** Frontend is calling a Tauri command that does not exist in the backend.

**Likely cause:** Command was renamed in Rust but the constant in `src/lib/commands.ts` was not updated.

**Fix:**

1. Check `TAURI_COMMANDS` in `src/lib/commands.ts`
2. Check `invoke_handler` in `src-tauri/src/lib.rs`
3. Ensure the name matches exactly (case-sensitive)

---

### Translation key shows as raw string (e.g., `services.startButton`)

**Meaning:** i18next could not find the translation for that key.

**Fix:**

1. Check `locales/en.json` for the key path
2. Ensure the key exists with the exact nested structure
3. Check `locales/hi.json` has the same key (both files must be in sync)

---

## Build Errors

### `pnpm tauri build` fails with "version mismatch"

All three version files must be identical. See `docs/RELEASE_PROCESS.md` Step 2.

---

### GitHub Actions build fails

Most common causes:

1. Emoji characters in `.yml` file (PowerShell encoding issue) - remove all emoji
2. Version format with hyphen/letters (MSI rejects it) - use clean semver
3. Dependency download failure - re-run the job

---

## Getting More Help

1. Check `docs/KNOWN_ISSUES.md` - your issue may be documented there
2. Use the Debug panel in dev builds to inspect path resolution
3. Check the relevant log file in `logs/`
4. Open a GitHub Issue: [DevStackBox/DevStackBox issues](https://github.com/DevStackBox/DevStackBox/issues)
   - Include DevStackBox version
   - Include OS version
   - Include the exact error message
   - Include contents of the relevant log file
