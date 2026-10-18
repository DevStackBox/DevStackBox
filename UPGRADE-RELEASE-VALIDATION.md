# DevStackBox 0.1.14 manual-upgrade fix

## Cause and changes

The old NSIS process commands passed doubled single quotes to PowerShell, producing
parser errors. Process detection interpreted the error exit code as "not running";
the force-stop commands also had invalid quoting. A read-only reproduction against
the original generated command returned the PowerShell parser errors and exit 1.
The early wizard-page stop also ran before its maintenance executable was extracted.

The upgrade now runs a packaged PowerShell file from the installer temporary
directory, after closing the GUI and before copying application files. It attempts
graceful shutdown through the installed application, handles owned Windows services,
then stops remaining owned processes and verifies they have exited. Ownership uses
an exact installation-directory prefix with a separator; other installations are
not targeted. Live processes with unavailable paths cause an error, while processes
that exited during enumeration are ignored. Program EXE/DLL files must pass an
exclusive-open check before copying proceeds. Query, permission, shutdown and file
lock errors abort installation with a nonzero result and visible diagnostics.

The premature wizard-page stop and maintenance executable copy were removed.
Legacy uninstall/process snippets also received corrected quoting. Existing website
backup directories are no longer deleted on retry; a failed www preservation or
restoration aborts rather than continuing or scheduling deletion after reboot.

## Checks completed

- `scripts/test-upgrade-stop.ps1`: running process inside an installation with
  spaces stopped; same-name process in a sibling-prefix directory stayed running;
  locked DLL rejected without changing content; retry and fresh install passed.
- `scripts/test-nsis-upgrade-stop.ps1`: compiled the actual NSIS stop function and
  embedded helper; a locked DLL caused nonzero exit before a payload marker could
  be written; releasing the lock allowed the payload marker on retry.
- The compiled NSIS test also confirmed that an existing `_www_preserve` backup
  survives retry, a locked website folder aborts before payload writes, and backup
  succeeds once that lock is released.
- Ran the new helper against the actual `C:\devstackbox` installation. Apache and
  MySQL stopped, remaining GUI exited, and installed program files passed lock
  checks. A subsequent process query found no owned running app/web/database service.
- Existing installed files were not upgraded by these tests. Services were left
  stopped for the user's next installation attempt.

## Limits

The complete new installer has not yet been run through an upgrade. Multi-account
elevation, restrictive enterprise policies, reboot interruption, third-party programs
reopening files between check and copy, and website-backup recovery need further
qualification. No claim is made that a preflight check eliminates every possible
Windows file-lock race. No public release or repository push was performed.

## Final artifact

- `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.14_x64-setup.exe`
- Product version verified: 0.1.14. Size: 187,114,185 bytes.
- SHA256: `ab77e1becfbdc7933fd8d90f0da62f1d37b6f00e418674e351bb74c5237bc042`.
- Installer build and release-input validation succeeded. Updater artifact and
  trusted-comment signatures verified independently against the configured public
  key. Adjacent `.sig` and `.sha256` files are available.
- Production frontend build passed with the existing chunk-size/import warnings.
- Installer has not been publicly published or installed over the user's current
  copy. Windows Authenticode signing is still not configured.
