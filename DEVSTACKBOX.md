# DevStackBox guide for AI coding tools

> Practical environment context for working on PHP applications served by DevStackBox on Windows. Read this file before choosing PHP, running Composer or Artisan, connecting to MySQL, or changing server configuration.

Maintained: 26 October 2026. Baseline: v0.1.19. Installed builds can differ; verify their behavior. This guide describes the environment, not permission to change it. Follow the user's task and the application's own instructions.

## Give this file to your AI tool

Attach this file, put it in your application repository, or ask your tool to read https://www.devstackbox.com/DEVSTACKBOX.md. The website also serves the same content at https://www.devstackbox.com/llms.txt.

Suggested prompt:

> Read DEVSTACKBOX.md before working on this application. Discover my actual DevStackBox installation, project document root, PHP runtime and MySQL port. Use those settings for commands and distinguish CLI failures from website failures.

For tools that load project instructions, add a reference to this file in the project's existing AGENTS.md, CLAUDE.md or IDE rules. Do not replace existing project instructions. A Markdown file is portable context; automatic discovery depends on the tool. DevStackBox does not provide a built-in AI agent, MCP server or public service-control CLI.

## First checks

1. Identify the application repository and read its instructions, composer.json and framework requirements.
2. Identify the installed DevStackBox version and executable location. Do not assume another PHP stack on PATH belongs to DevStackBox.
3. Identify the user-data root, configured ports and project's saved hostname/document root.
4. Confirm whether the website follows global PHP or is pinned to a branch. Inspect the exact patch version and loaded ini for the CLI you intend to use.
5. For database work, verify the configured server and data directory before modifying data.
6. Reproduce the reported failure at the intended URL or command, then inspect the corresponding logs. Change only what the evidence supports.

## Environment map

DevStackBox manages Apache, PHP, MySQL, phpMyAdmin and local HTTPS. Start and stop services through Dashboard or Services. PHP readiness is not an independent running web server. Apache serves websites; phpMyAdmin requires Apache and MySQL.

| Item | Default or source of truth |
| --- | --- |
| Installation | Usually C:\devstackbox; verify the running executable or installation chosen by the user |
| User data | %LOCALAPPDATA%\devstackbox; DEVSTACKBOX_DATA_DIR can override it for the app process |
| Default localhost document root | www under the installation directory |
| Connected project | Any accessible local folder, including another drive; connecting does not move files |
| Apache configuration | config/httpd.conf under user data; read Listen and included configuration for actual ports |
| MySQL configuration | config/my.cnf under user data; use [mysqld] port and check client settings |
| Global PHP configuration | config/php.ini under user data |
| Pinned PHP configuration | config/php-runtimes/BRANCH/php.ini under user data; BRANCH is the selected major.minor version |
| Saved sites | config/vhosts.json under user data; inspect as needed, use Projects to change sites |
| Database files | mysql-data under user data; do not manipulate live database files directly |
| Logs | logs under user data; actual Apache ErrorLog and PHP error_log settings can override destinations |

HTTP 80 and MySQL 3306 are defaults, not proof of the current configuration. An IDE terminal may have a different PATH or DEVSTACKBOX_DATA_DIR from the desktop app. Do not assume C:\xampp, XAMPP's htdocs, a system PHP executable, or another server on port 3306 is the right target.

## Discover paths before running commands

These PowerShell checks report executable locations without dumping environment variables or credentials:

```powershell
Get-Process devstackbox -ErrorAction SilentlyContinue |
    Select-Object Id, Path
Get-Command php, mysql, composer -All -ErrorAction SilentlyContinue |
    Select-Object Name, Source
```

If exactly one accessible DevStackBox executable is running, derive its installation location. If none or several are found, resolve the intended installation first. A source/debug build resolves its binaries differently; use its repository and configured test profile instead of this installed-build example.

```powershell
$dsbExecutables = @(Get-Process devstackbox -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Path -Unique | Where-Object { $_ })
if ($dsbExecutables.Count -ne 1) {
    throw 'Identify the intended DevStackBox installation before continuing.'
}
$dsbInstall = Split-Path -Parent $dsbExecutables[0]
$dsbData = if ($env:DEVSTACKBOX_DATA_DIR) {
    $env:DEVSTACKBOX_DATA_DIR
} else {
    Join-Path $env:LOCALAPPDATA 'devstackbox'
}
# Confirm this data root matches the desktop app, especially with custom profiles.
$dsbIni = Join-Path $dsbData 'config/php.ini'
$dsbPhp = @('php/current/php.exe', 'php/8.3/php.exe', 'php/php.exe') |
    ForEach-Object { Join-Path $dsbInstall $_ } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
if (!$dsbPhp -or !(Test-Path -LiteralPath $dsbIni -PathType Leaf)) {
    throw 'PHP or the user ini is missing; inspect DevStackBox PHP settings.'
}
& $dsbPhp -c $dsbIni -v
& $dsbPhp -c $dsbIni --ini
& $dsbPhp -c $dsbIni -m
```

The fallback order matches global PHP resolution in the verified source. Confirm the result against the app; do not silently substitute a different PHP on PATH when resolution fails.

## Website PHP and command-line PHP

- Services → PHP → Versions manages installed branches and the global selection. Keep full patch versions distinct from branch labels such as 8.3.
- Projects → Manage project → PHP & tools selects a site's installed runtime. Its saved selection is not a live measurement of an HTTP request.
- DevStackBox terminal sessions use global PHP and start in the default www folder. Change to the application repository explicitly. Reopen sessions after switching the global runtime.
- External IDE terminals do not automatically inherit DevStackBox's PATH or PHPRC. Prefer a verified executable with an explicit -c ini argument.
- For CLI work that must match a pinned website, resolve php/BRANCH/php.exe under the installation and config/php-runtimes/BRANCH/php.ini under user data, verify both files, then run the same version/ini/module checks. Do not switch every project's global PHP just to run one command.
- Global ini edits are not automatically copied into pinned-runtime ini files. Verify required extensions against the runtime actually serving the failing task.

Run Laravel commands from the repository containing artisan, not from public. After resolving $dsbPhp and $dsbIni to the intended runtime, a read-only check is:

```powershell
& $dsbPhp -c $dsbIni artisan --version
```

Inspect how Composer is installed before invoking it: composer.bat can resolve a different php.exe through PATH. If using a verified composer.phar, invoke it with the selected PHP executable and ini. Do not assume Composer, Node.js, Git or framework dependencies are bundled. Follow the project's lockfiles and setup instructions; avoid composer update or destructive database migrations unless the task calls for them. PHP Interactive is a PHP REPL, not a PowerShell/CMD prompt.

## Connect and diagnose an application

1. Projects → Add project / site → connect the existing folder.
2. Choose a unique .test hostname and review its document root. For Laravel, use the application's public directory so .env and private source files are not served.
3. Choose an installed PHP runtime if the project requires one; configure its database and dependencies separately.
4. Start Apache, then open the saved hostname, including a nondefault port when configured. Open localhost targets the default www site, not every connected project.
5. Enable local HTTPS through the app if needed. Certificate trust and the website's HTTP response are separate checks; trusted TLS can still return 404 or 500.

DevStackBox v0.1.17 ignores ancestor .htaccess files above the document root by default while allowing document-root and descendant rules. Laravel's public/.htaccess should work with the generated site configuration. An Apache error such as '<IfModule not allowed here' occurs before Laravel executes. Check the error's exact file path, the loaded Apache config, document root, rewrite module and override policy. Do not apply a blanket AllowOverride All to the filesystem root or copy a C:/xampp/htdocs block into an unrelated installation.

Use Project details → Server logs and the service Logs tabs. Apache logs are shared; PHP logs can be shared by sites using the same runtime. Compare timestamps and paths. An empty log does not prove health. Check application logs separately, such as Laravel's storage/logs, without exposing secrets.

## Connect to the correct MySQL server

Use the client inside the verified installation: mysql/bin/mysql.exe, or mysql/mysql.exe in a flat packaged layout. Read the configured port; use explicit TCP, 127.0.0.1 and the intended account. Do not assume root has an empty password or that an external terminal inherits the app's stored credentials.

After discovering $dsbInstall and reading config/my.cnf, this interactive PowerShell example prompts for connection values instead of embedding credentials:

```powershell
$dsbMysql = @('mysql/bin/mysql.exe', 'mysql/mysql.exe') |
    ForEach-Object { Join-Path $dsbInstall $_ } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
if (!$dsbMysql) { throw 'DevStackBox MySQL client was not found.' }
$dsbMysqlPort = [int](Read-Host 'MySQL port verified in DevStackBox config/my.cnf')
if ($dsbMysqlPort -lt 1 -or $dsbMysqlPort -gt 65535) { throw 'Invalid port.' }
$dsbMysqlUser = Read-Host 'MySQL account for this task'
& $dsbMysql --no-defaults --protocol=TCP --host=127.0.0.1 `
    "--port=$dsbMysqlPort" "--user=$dsbMysqlUser" --password `
    --execute='SELECT @@port, @@datadir, VERSION(), CURRENT_USER();'
```

The client prompts for the password. Agents without interactive input should use an existing approved credential mechanism or ask for the connection method, not print or embed passwords. Compare @@datadir with the intended user-data/mysql-data folder, normalizing Windows path separators. Stop if the instance is wrong. A refused connection and an authentication failure require different fixes.

Creating a MySQL user does not automatically grant database privileges. Use an application account with the needed grants. Connecting a project does not create its database or rewrite its .env automatically. Do not dump .env, credential files or full database contents into chat or logs.

## Configuration, backups and recovery

Edit user configuration through Services → Config/php.ini where possible; the editor validates and keeps history. Installer templates are not the active user configuration. Preserve migration markers and existing custom values. App-managed paths and some logging settings may be normalized during preparation. Restart the affected service and verify the actual result; PHP website changes usually require restarting Apache.

Databases → Backups exports SQL and restores .sql files through the MySQL client. An initial database selection does not prevent USE statements in the dump from selecting another database. Imports may partially apply before failing. Back up affected data first and test restoration using disposable data.

Settings → Backup & Restore includes configuration, the installation's www files and a MySQL dump when available. It excludes external project contents, logs, service binaries and HTTPS/SSL private material. Back up external repositories separately. Disconnecting a project keeps its files; dropping a database does not. Do not delete mysql-data, unrelated hosts entries or user configs as a generic repair.

## Report what you verified

State the installed app version, chosen PHP executable/full version/ini, project hostname/document root, and relevant configured ports. Report commands/checks and their outcomes without credentials. Distinguish saved configuration, a successful CLI check and a live website response. State any untested behavior instead of declaring the entire stack healthy.

## Further documentation

- [Projects, PHP and HTTPS](https://www.devstackbox.com/docs/getting-started/projects)
- [PHP and extensions](https://www.devstackbox.com/docs/user-guide/php)
- [Configuration](https://www.devstackbox.com/docs/reference/configuration)
- [SQL backup and restore](https://www.devstackbox.com/docs/user-guide/database-backups)
- [Troubleshooting](https://www.devstackbox.com/docs/advanced/troubleshooting)
- [Source repository](https://github.com/DevStackBox/DevStackBox)

Maintainers: this is the canonical file. The website copies it unchanged to /DEVSTACKBOX.md, /llms.txt and the existing /llms-full.txt URL during content preparation. Update it when runtime resolution, configuration paths or user workflows change; do not maintain separate tool-specific copies.


## Database workspace (v0.1.18)

**Databases | Users | Import & Export** provides native SQL/GZIP exports, imports, managed backups and versioned DevStackBox ZIP packages. Activity tracks native jobs across page navigation; failed or cancelled imports can leave changes and never retry automatically. Initial target selection does not confine SQL to that database. Packages restore their original recorded names; arbitrary original-name dumps are imported individually.

Use Manage for table/view metadata. Users > Database permissions edits direct database grants, preserving unmanaged scopes. Read/write omits schema-migration privileges. Root/system identities and native schema deletion have explicit protections; those protections are not a sandbox for arbitrary SQL imports.

Checksum checks verify file integrity, not restoration. Native integration tests use scripts/test-database-workspace.ps1 with a disposable data directory and port. Never point destructive tests at a user's projects. Database migration, remote transfer and account renaming remain deferred. See docs/user-guide/database-backups.mdx for limitations and the distinct published workflow.
