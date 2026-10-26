# PHP environment and shared log management

Status: shipped in v0.1.19 (2026-10-26).

## Changes

- Global and pinned PHP configuration now fill missing/empty `sys_temp_dir` and `upload_tmp_dir` independently of the previous upload-limit migration. Custom nonempty paths survive. Temporary directories are resolved per Windows user.
- Fresh profiles enable available Laravel/WordPress modules, including both MySQL and SQLite PDO drivers. Existing extension choices remain unchanged. Built-in modules are not given invalid DLL directives. Imagick and other optional third-party extensions are not claimed as bundled.
- A small native console launcher is packaged as `bin/php.exe`. It selects `php/current` on every invocation, falls back to bundled PHP, uses the invoking user's configuration, and forwards streams, arguments and exit status without a shell. No global PHPRC is installed.
- NSIS appends the launcher directory to the machine PATH, preserves other entries and unexpanded environment variables, broadcasts the change, and records ownership for targeted uninstall cleanup. Existing terminals/IDEs may need restarting. Another PHP earlier in PATH retains precedence.
- Logs now has **Apache | MySQL | PHP | Archives & rotation**. The management page owns one policy for all managed diagnostic logs. Service-specific viewers link to that page and do not start management-page log polling.
- PHP Versions uses **Default** and **Set as default**. The explanation distinguishes inherited default projects, pinned runtimes and CLI PHP.

## Verification

- Frontend: 70 passing tests, including management navigation without service-log reads and cached/never-started service crash regressions; TypeScript passed.
- Native: 61 passing tests and one intentionally ignored disposable database integration test.
- CLI smoke: fresh profile defaults, temporary-file creation, required modules, custom ini preservation, disabled extension preservation, quoted arguments, stdin, exit status and default junction changes from PHP 8.3 to 8.5.
- Isolated Apache/PHP-CGI request: HTTP 200, TMPFILE_OK, correct user temporary directory, cURL and SQLite enabled. The test reproduced a profile with an existing upload-limit migration marker and missing sys_temp_dir; migration repaired it. Probe removed afterward. Test used a separate loopback port and profile, without hosts or trust-store edits.
- PATH transformation tests cover existing entries, duplicate paths, quoted paths and exact removal. Actual installer registration is a separate installed-build check.

## False crash warning found during UI audit

The live process scan could count a short-lived `httpd.exe -v` version query as a running Apache server. Its normal exit then triggered the crash toast, even when Apache had never been started. The shared process lookup now excludes Apache version/configuration probes and MySQL version/help/initialization probes. Two native regression tests cover diagnostic commands and real server commands, including quoted paths. No additional polling was introduced. Cached state alone still cannot establish a crash baseline.

The final UI pass also removed a duplicate archive shortcut from the Logs workspace and changed PHP's initial loading state from an incorrect “Not installed” to “Checking…”. The corrected production executable was checked in an isolated profile: Dashboard and About version checks produced no new crash event, Logs showed the shared management tab, and PHP Versions showed Default/Set as default.

## Installed verification

The v0.1.19 installer completed with exit code 0 on 26 October 2026. The installed executable reports 0.1.19. Machine PATH retains its previous entries and contains the launcher directory exactly once. A fresh terminal environment resolves `php` to `C:\devstackbox\bin\php.exe`, reports PHP 8.3.36, loads the normal user's php.ini and returns TMPFILE_OK with the user's DevStackBox tmp directory. The installed launcher matches the packaged binary. Existing configuration hashes were preserved; only the obsolete https-setup-error.txt marker was removed. The installed app was opened with the normal profile, services stopped; Dashboard and About produced no new crash event. The website production build passed all 61 pages, including the updated native-resolution PHP/log policy screenshots. No release was published.

## Reproduce

Run `npm test`, `npm run test:php-cli`, `powershell -NoProfile -File scripts/test-php-path.ps1`, and `cargo test --lib` from the appropriate package directories. `cargo run --example php_temp_smoke` requires a fresh absolute `DEVSTACKBOX_DATA_DIR` under `review-artifacts` and free loopback port 18193. It starts and terminates only its disposable Apache process tree.

Automatic log maintenance remains off by default. Service archives wait for stopped writers; this work does not introduce live Apache/MySQL rotation.
