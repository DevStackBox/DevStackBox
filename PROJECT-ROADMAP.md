# Project workspace roadmap

> Historical planning/evidence: version-specific sections describe their original dates. For v0.1.17 use docs/feature-status.mdx, docs/development/release-runbook.mdx and docs/RELEASE-VALIDATION.md.

Status: implementation started on 18 October 2026. AI integration is deferred
at the user's request, including MCP and agent-specific tools.
This roadmap includes future work; the progress log below distinguishes source
changes from shipped and verified features.

### Implementation progress

- Public v0.1.12 (validated in internal build 0.1.15) adds one project per row and installed-only, per-project website PHP
  selection, including simultaneous HTTP/HTTPS validation with PHP 8.3 and 8.5.
  See `docs/RELEASE-VALIDATION.md` for evidence and remaining terminal/configuration
  UI scope. Runtime selection does not change the global PHP default.

- Added stable project IDs, retained through hostname edits and persisted on the
  next successful site save. Legacy records remain readable.
- Added a project details route and full-page website editing, linked from both
  Projects and Virtual Hosts; the add-project dialog remains.
- Added separate website-response and HTTPS diagnostics, empty/missing-root
  guidance, and read-only saved/generated configuration comparison.
- Configuration mismatch detection is diagnostic only. The original mismatch's
  cause, durable transaction recovery, restart/upgrade qualification and runtime
  isolation remain open. Do not call Phase 0 complete yet.
- The initial 0.1.13 increment did not include per-project runtimes. Framework
  downloaders, DB linking, Git/SSH and AI integration remain unimplemented.
  Existing PHP management is retained.

Validation for the 0.1.13 installer candidate: 29 Rust unit tests and 25 frontend tests
pass; TypeScript, documentation validation and the production frontend build
pass. The build still reports existing bundle-size/mixed-import warnings.
Tests cover stable IDs through rename/serialization, empty/missing roots,
configuration drift, trusted HTTPS with HTTP 404, full-page saving and save
failure feedback. Native UI visual review, live HTTP diagnostics against multiple
apps, Hindi translation and upgrade qualification remain pending.
The existing installed app and its project configuration were not changed by this
increment. The installed profile still has an empty vhosts.json alongside an
a.test entry in ssl.conf; detection does not establish or repair its cause.
HTTPS setup/renewal now stops before writes or restarts when generated configuration
contains a site without an active saved record, preserving that configuration for
review and reconnection. This guard is covered by a regression test.

## 1. Product decisions

- Projects become the primary workspace for a website. Virtual Hosts remains an
  advanced view of the same records, not a second independent configuration store.
- Move editing to a project details page. Keep Add project short; continue setup
  and management on that page.
- Retain the existing PHP management screen for downloading/installing versions
  and enabling extensions. Projects select only installed, validated runtimes.
- Installing PHP and choosing the global default are separate operations.
  A version does not need to become the global default before a project uses it.
- Each project chooses **Use default** or an explicit installed PHP version.
  Its web requests, project terminal, Composer, Artisan, WP-CLI and managed workers
  must resolve through that same selection.
- WordPress, Laravel, their dependencies and optional development tools are NOT
  bundled into the installer. Download and install them only after an explicit
  project setup request, using upstream distribution mechanisms.
- Connecting an existing folder keeps files in place. Never run dependency
  installers, migrations or project scripts just because a folder was connected.
- HTTPS trust and website health remain distinct. A trusted connection can serve
  a 404, 403 or application error; display both results accurately.

## 2. Current baseline and gaps

The existing application has PHP downloads, a shared active PHP selection,
embedded terminals, project-folder connection, virtual hosts and mkcert-based
HTTPS. Current virtual hosts and terminals use shared PHP paths/configuration.
There is no independent project runtime binding yet.

The a.test investigation found an empty document root and inconsistent saved
versus generated site state. Diagnose and fix persistence/reconciliation before
expanding the workspace. Do not infer the cause of that mismatch without a
reproducible test. Existing HTTPS release qualification remains tracked in
`docs/RELEASE-VALIDATION.md`.

## 3. Navigation and project details

Project cards show name/framework, URL, effective PHP version, website response,
HTTPS state and an actionable warning. Search by name, domain and folder.
Clicking a card opens `/projects/<stable-id>`; deep-link individual tabs.

Header actions: Open website, Open editor, Open folder, Open terminal.
Show the absolute folder and selected environment; wrap long paths. Use icons
with text, accessible names, visible keyboard focus and persistent error messages.

| Page        | Contents                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Overview    | Website and HTTPS health, PHP, linked databases, framework detection, quick actions and recent operations    |
| Website     | Folder, document root, domains/aliases, HTTPS and verification results                                       |
| PHP & tools | Installed runtime selector, effective version/config, extensions, compatibility, link to central PHP manager |
| Databases   | Create/link connections, test, phpMyAdmin, import/export and configuration assistance                        |
| Development | Project terminals, Git status, Composer/framework tasks, managed workers                                     |
| Backups     | File/database snapshots, contents, restore preview and results                                               |
| Settings    | Name, integrations, permissions, disconnect and separately protected file deletion                           |

Remote connections and AI access can be additional sections when implemented;
do not fill the initial page with nonfunctional icons. Show framework-specific
actions only for the detected/selected framework. Validate minimum window size,
light/dark themes, English/Hindi, keyboard navigation and screen-reader labels.

Add project entry points:

1. Connect existing folder: detect framework, suggest public root, review hostname.
2. Create empty project: explicit starter-page creation with destination preview.
3. Clone repository: introduced with Git support.
4. Install WordPress/Laravel: introduced with on-demand recipes.

For empty existing folders, show “No index page found” and offer a deliberate
starter-page action. Never overwrite an existing file. Explain that static export
folders and PHP roots differ from Node development servers, which need a future
reverse-proxy workflow. Offer document-root Browse as well as project Browse.

Editing uses Save/Cancel, an unsaved-change warning and an impact summary. On
Apply, show real stages: validate, prepare, apply, restart if needed, verify.
On failure identify what failed and what was restored; retain the entered values.

## 4. Per-project PHP and terminals

### User workflow

1. Install the required PHP version under **Services → PHP → Versions**.
2. Return to the project's PHP & tools page and select an installed version.
3. Preview compatibility checks and restart impact, then Apply.
4. Verify a PHP request through both project HTTP and HTTPS; show actual version.
5. New project terminals/tasks use that exact executable and configuration.

Unavailable versions are not selectable. Show **Manage PHP versions** and retain
the user's project/page when they return. Show installed versus global-default
versus selected-project version distinctly. Downloading a runtime must not switch
other projects. A missing pinned version produces an actionable error, never a
silent fallback to a different PHP branch.

### Runtime contract

- Introduce one runtime resolver shared by Apache, terminals, task runner, CLI
  and future MCP. Return executable, CGI executable, version identity, ini path,
  extension directory and process environment.
- Use version-specific installed paths, not the mutable `php/current` junction,
  for pinned projects. Store the selected runtime identity; show its patch version.
- First implementation may select a branch with a recorded installed patch;
  updates must display the projects affected. Do not promise simultaneous patch
  pinning unless the installation layout actually supports it.
- Configuration and extensions must match the PHP build/architecture. Never
  point multiple branches at a shared ini containing another branch's extension_dir.
- Keep central per-version extension management. Optional project ini overrides
  are a later capability with explicit precedence and compatibility checks.
- Prototype explicit per-vhost CGI handlers first using the existing Apache
  architecture. Prove configuration/environment isolation; if inadequate, choose
  isolated FastCGI workers before building the selector. Do not assume PHP-FPM
  availability on Windows or claim per-project PHP from a UI-only change.
- Generate matching handlers for both HTTP and HTTPS and aliases. Keep localhost
  and phpMyAdmin on their documented system/default runtime independently of a
  pinned project's runtime. Validate syntax, restore on failure, verify afterward.
- A shared Apache restart may briefly affect all sites. Show that fact rather
  than promising zero interruption to other projects.

### Terminal and task behavior

- Open at the project root; display project name and resolved PHP version.
- Set PATH and PHP ini environment on the child process only. Do not change the
  user's Windows PATH globally. Check inherited PHPRC/PHP_INI_SCAN_DIR so another
  installation cannot accidentally supply configuration.
- Invoke managed Composer/Artisan/WP-CLI tasks with the resolved PHP executable;
  do not rely on a globally installed wrapper selecting the correct PHP.
- Existing terminals keep their environment after a project version change.
  Label them “Using previous PHP version” and offer a new/restarted terminal.
  Do not kill commands silently. Apply the same policy to long-running workers.
- Manually opened external shells are unaffected. A future “Open external project
  terminal” action may supply an environment; do not imply arbitrary IDE terminals
  automatically inherit it.
- Prevent removal of runtimes referenced by projects, active sessions or managed
  tasks. Offer reassignment and deliberate session shutdown first.
- Changing the global default previews affected **Use default** projects and new
  general terminals; pinned projects remain unchanged. Unsupported/end-of-life
  branches should be identified without silently upgrading legacy applications.

### Required tests

Two projects simultaneously return different PHP_VERSION values over HTTP and
HTTPS. Each terminal's `php -v`, `php --ini`, Composer execution and framework
task agree with its web runtime. Test global-default changes, version uninstall
protection, missing/corrupt runtimes, extensions, paths with spaces/non-ASCII,
aliases, startup/upgrade persistence and failed-switch rollback. Test an old
terminal during a version change and verify that another pinned site is unchanged.
Temporary diagnostic PHP files must be removed after tests.

## 5. Data model and reliable operations

Use versioned project metadata with a stable ID independent of hostname or path.
Keep name, project root, document root, detected framework, PHP selection, site
references, database references, tool settings and remote-connection references.
Store secrets separately in Windows-protected storage, not in JSON or Git.

Migrate existing vhosts/folders without moving files, changing their effective
PHP version or enabling HTTPS unexpectedly. Record uncertain legacy state for
review rather than discarding it. Back up metadata before migration and support
recovery. Test case-insensitive and junction paths on Windows.

Use one authoritative store, derived Apache files and a shared operation queue.
Lock mutations across processes. Persist operation intent and recovery information
for interrupted work; never snapshot private keys into ordinary portable backups.
Preflight inputs and unmanaged hostname conflicts; preserve unrelated hosts lines.
Reconcile saved project/site state against generated configuration and served
health markers. Distinguish inspection from an explicit repair action.

Health checks should report: folder exists, index/framework entrypoint detected,
name resolution, HTTP response, expected host, TLS trust, served certificate,
PHP execution and optional database connectivity. Missing index is guidance, not
a blanket rejection: some applications intentionally use rewrites/custom routes.
Use bounded checks and timestamps; invalidate stale results after changes.

## 6. Databases

Support zero or multiple named connections per project. Create a local database
with a dedicated user or link an existing one; do not default applications to the
server root account. Keep “linked in DevStackBox”, “connection verified” and
“application configured” separate.

Provide direct phpMyAdmin links, test connection, masked connection details,
configuration snippets, import/export and snapshots. Laravel .env or WordPress
configuration edits require an exact change preview and backup. Preserve comments
and unrelated keys. Avoid exposing credentials in process arguments, logs or MCP.
Disconnect keeps databases/files by default. Shared databases need ownership and
dependency checks before any destructive action. Remote DB support follows local
support, with explicit environment labels and separate permissions.

## 7. Git, SSH and tools

Detect installed Git first; show path/version and allow an override. Optional
Portable Git is an on-demand download, not a new installer payload. Start with
clone, status, branch display, fetch and open in editor. Do not automatically
reset, discard, pull over dirty files, run hooks or push. Make network actions
explicit and use existing credential/key providers.

Project terminals are local. SSH is a future Remote connections feature: named
staging/production connections, host/port/user, existing SSH config or key
reference and remote directory. Respect host-key verification; keep private keys
out of project exports. SFTP/deployment require a separate diff/approval/recovery
workflow. Do not bundle or enable an SSH server on users' machines.

Detect Composer, Node/npm and editors before offering optional tool installation.
Preserve the lightweight installer. Managed tasks need cancellation, output limits,
exit status and recorded project/runtime identity. A repository's scripts are
executable input, not automatically authorized setup instructions.

## 8. On-demand WordPress and Laravel

No WordPress/Laravel application archives, vendor packages or node_modules ship
with the installer. Show version, source, destination and prerequisites before
download. Use current upstream compatibility information rather than hardcoded
claims about the latest release. Check network access and disk space first.

WordPress recipe: validate selected installed PHP/extensions, create/link DB,
download via official WordPress distribution/WP-CLI, verify upstream checksums,
configure URL and install after user supplies admin details. Finish with site/admin
links. Do not log passwords or expose them to an AI agent by default.

Laravel recipe: validate selected PHP and Composer, offer a compatible Laravel
release, create through its official Composer package/distribution workflow,
select public/, prepare environment/application key and optional DB configuration.
Show dependency script execution and obtain explicit action for migrations and
optional npm build. Never silently download another PHP version from this wizard:
send the user to PHP Versions, then resume setup after installation.

Download to staging, validate archive paths and integrity using available upstream
metadata, then finalize without overwriting an existing project. Display progress,
cancel/retry and failure cleanup; do not delete user-supplied directories. Cache
verified downloads optionally with clear storage controls. Cache reuse does not
guarantee fully offline Composer/npm installation. Credentials and database
changes require their own recovery steps, not just deleting a download folder.

## 9. CLI and AI agent access

**Deferred - not authorized for current implementation.** Retained below only
as future design notes; do not implement until the user reopens this scope.

Build UI, CLI and MCP adapters over the same project service; do not duplicate
configuration logic. Start with a local CLI and structured JSON output. Suggested
read-only operations: projects list, project inspect/doctor/logs, runtime inventory,
Git status and database schema (with permission).

Then offer an optional local stdio MCP server, disabled until enabled by the user.
Expose project-scoped read-only tools first, with bounded/redacted logs and no
secrets by default. Add explicit capability grants for controlled mutations:
connect project, select installed PHP, repair site, create DB, backup and approved
tasks. Bind operations to stable project IDs. Return structured progress/results.

Give agents a proposed change plan, then apply through the normal validator and
operation queue. Maintain an activity log. Require explicit approval for destructive
database operations, restore, Git push, SSH/deployment and broad command execution.
Treat repository/log text as untrusted data. Tool descriptions/annotations do not
enforce permissions; the backend must. Avoid an unrestricted shell/SQL tool as the
initial interface. Remote MCP/network listeners are a separate security design.

An optional redacted project context export can describe framework, runtime,
paths and approved tasks for coding assistants. Preview it before writing to a
repository; never overwrite existing agent instructions. An embedded AI chat and
model billing are out of scope for the first MCP release.

## 10. Delivery sequence and acceptance gates

| Phase                        | Scope                                                                                                                            | Exit condition                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0 - Correctness              | Reproduce saved/generated site mismatch; authoritative state, migration, health distinctions, empty-folder UX and recovery tests | Existing sites survive edit, restart and upgrade with consistent records/configuration                                         |
| 1 - Runtime foundation       | Installed-runtime registry/resolver; HTTP/HTTPS per-project PHP proof; project terminal environment; uninstall dependency checks | Two sites and their terminals run different installed PHP versions correctly; rollback passes                                  |
| 2 - Project workspace        | Details routes, full-page editing, overview/website/PHP tabs, accessible responsive UI                                           | Existing and new projects can be managed without the edit popup; effective runtime and health are clear                        |
| 3 - Daily workflows          | Local DB linking/config assistance, Git detection, editor/terminal actions and project backups                                   | App/DB configuration states and recovery are verified; secrets stay protected                                                  |
| 4 - Framework recipes        | On-demand WordPress/Laravel and optional prerequisites                                                                           | Fresh compatible installs pass site/PHP/DB checks; cancelled/failed downloads preserve user files; installer payload unchanged |
| Deferred - Agent integration | Excluded from current work; future design notes only                                                                             | Requires a new user request before implementation                                                                              |
| 6 - Remote/advanced          | SSH, deploy previews, workers, mail/Redis and reverse proxy as separate increments                                               | Environment boundaries, process ownership and recovery are tested per capability                                               |

Recommended first work: **Phase 0, then a small Phase 1 runtime proof**. A full
details-page redesign should follow that proof so its PHP controls represent real
runtime isolation. Do not begin with WordPress/Laravel buttons or broad AI tools.

For every release: test clean install and upgrade, existing files/databases,
standard-user and elevation paths, offline failure, version selection persistence,
Windows paths, process cleanup and cancellation. Test themes/languages/minimum
window size for changed screens. Record untested cases rather than marking the
entire roadmap complete after a successful build. Use separate reviewed commits
and versioned installers per accepted phase; do not publish automatically.

## 11. Upstream references

- [PHP configuration discovery](https://www.php.net/manual/en/configuration.file.php)
  - executable/ini/environment isolation must be tested for CGI and CLI.
- [Laravel installation](https://laravel.com/framework/docs/12.x/installation)
  - reference workflow; select the documentation matching the release offered.
- [WP-CLI core commands](https://developer.wordpress.org/cli/commands/core/)
  - download, install and checksum verification.
- [Git for Windows, including Portable Git](https://git-scm.com/downloads/win)
- [MCP security guidance](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/draft/basic/authorization/security-considerations.mdx)
  - recheck the stable specification at implementation time.

## Diagnostics follow-up - 19 October 2026 (v0.1.13)

- Project details reads Apache errors and the PHP log matching the saved pinned runtime; global-default projects use the global PHP log. These logs are shared, not isolated per project.
- Log-reading failures remain visible. Empty or old logs do not establish website health, and custom log destinations may differ.
- PHP selection is explicitly a saved setting, not a verified measurement of live website PHP.
- Before site edits mutate files or restart services, reject generated hosts absent from both old and incoming site records. Permit deliberate removal/rename and reconnection; never silently erase unrelated orphan hosts.
- Still unresolved: the cause of the observed saved/generated configuration divergence and stale Apache log. No automatic recovery or repair of the installed configuration was attempted.
- Laravel files, dependencies, and environment remain untouched. These changes target v0.1.13 and are not in the v0.1.12 installer.
- Site snapshots now fail on unreadable files instead of treating them as absent. Site config writes use staged replacements, with persistent pre-change recovery copies in the configuration backups directory. This is not a crash-atomic transaction across all files.
- Configuration editor writes and full-backup restoration share the site-operation lock to prevent those operations racing with site updates.
- Validation: 27 frontend tests, 33 Rust tests, TypeScript and documentation checks passed. Live isolated Apache reproduction was blocked by automatic approval review; the installed HTTP 500 is not claimed fixed.

## Microsoft Store / MSIX audit and implementation plan - 19 October 2026

Status: source and documentation audit complete; implementation and packaged runtime
validation have NOT started. The user has chosen to stop using Certum and investigate
Microsoft Store MSIX distribution. Public v0.1.13 remains the existing GitHub release.
This section supersedes the earlier deferred EXE/MSI Store proposal. AI integration
remains deferred. No installed application, projects, certificates, Windows settings,
Partner Center records or published release assets were changed during this audit.

### Decision and limits

Use a full-trust packaged desktop application (medium integrity), not an AppContainer
rewrite. Microsoft documents Tauri-to-MSIX packaging; the Store signs the accepted
MSIX package. This does not sign the separate GitHub EXE, individual downloaded PHP
runtimes, or arbitrary project executables. Local test packages require development
trust or an appropriate development registration; ordinary Store customers do not
need to install our development certificate.

The code is NOT ready to wrap unchanged. Package installation files are read-only,
package locations change between versions, NSIS hooks will not run, and elevation
is a separate certification issue. Full trust is not administrator permission.
Microsoft's current capability guidance allows an advance request for allowElevation
under strict criteria; do not assume approval or try to bypass it using an external
script, helper download, scheduled task, or service.

The current Partner Center screenshots show an EXE/MSI product (URL plus silent
switches), not an MSIX upload. Leave that package entry empty. Keep its name reservation
until the technical proof passes. Then verify with Partner Center support whether
conversion/name transfer is supported; otherwise create an MSIX or PWA **app** draft
and coordinate reservation release/reclaim. Do not delete or release names automatically.
Copy the prepared listing content; use the new product's exact package identity and
publisher values, not the Tauri identifier or a guessed certificate subject.

### Evidence and feature impact

| Area                             | Source evidence                                                                                                                                               | Required change / proof                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package layout                   | `src-tauri/tauri.conf.json` targets NSIS only; bundles Apache, MySQL, PHP 8.3, phpMyAdmin, www and mkcert                                                     | Stage the real application binary and all required resources with preserved subdirectories. Add MSIX manifest, identity, assets, architecture and dependencies. SDK MakeAppx is installed; winapp was not found on PATH. No existing MSIX manifest was found.                                                                                                                                          |
| Writable PHP                     | `utils/paths.rs::active_php_dir`; `commands/php.rs::php_root`, download staging and `switch_php_version` use installation/php and a cmd mklink junction       | Add a runtime catalog merging immutable bundled PHP with user-downloaded branches. Store explicit active runtime selection in user settings; remove the installation junction requirement. Centralize resolution for web, CLI, status, diagnostics, ini/extensions, backups and future project terminals.                                                                                              |
| Project files                    | `utils/paths.rs::user_www_dir` creates installation/www; `commands/system.rs` writes phpinfo there; Apache seeds starter pages                                | Put new projects in a visible user-owned workspace outside package storage. Connect existing folders in place. Package www becomes read-only seed content, copied only for explicit new setup without overwriting files.                                                                                                                                                                               |
| AppData and retention            | `get_user_data_root` uses LOCALAPPDATA/devstackbox and silently ignores directory creation errors; fallback is installation/data                              | Do not assume the current apparent AppData path is physically shared with unpackaged editors or survives uninstall. Use explicit per-channel application state and a user-selected persistent workspace for databases/backups/project data. Fail visibly on inaccessible paths; prohibit write fallback into the package. Test physical visibility and uninstall behavior.                             |
| Versioned package paths          | Apache ServerRoot/modules, MySQL basedir, PHP extension_dir and vhosts contain absolute installation paths; config migration currently checks schema versions | Store a separate layout/package fingerprint. On update, stage/rebase generated path directives and validate before activation even when schema versions are unchanged. Preserve user directives, project IDs, ports, credentials and runtime pins. Do not rewrite unrelated text or reuse stale package paths.                                                                                         |
| phpMyAdmin                       | `utils/phpmyadmin_config.rs` writes missing bundled config.inc.php; `config/phpmyadmin.config.inc.php` contains relative upload/save/tmp directories          | Ship a read-only loader/config entry and resolve mutable configuration, secret, sessions, upload/save/tmp locations through explicit writable paths. Verify actual active bundle configuration and custom database ports before changing it; first-run repair must not write inside the package.                                                                                                       |
| Virtual hosts                    | `commands/vhosts.rs::change_hosts` elevates current executable through PowerShell RunAs; `main.rs` handles --hosts-operation                                  | Automatic custom .test names cannot ship unchanged in the standard-user Store design. Prototype project.localhost resolution in supported browsers/Windows clients; retain localhost with distinct project ports as a fallback candidate. Do not claim either candidate works until tested with PHP apps and redirects. Existing .test projects need an explicit migration or approved elevation path. |
| Local HTTPS                      | `commands/ssl.rs` hashes mkcert, uses per-user CAROOT, calls mkcert -install; trust check uses certutil -user                                                 | Current-user HTTPS is worth retaining. Upstream mkcert uses CertOpenSystemStoreW(ROOT), which Microsoft documents as current-user only. Prove a separately created test CA in an isolated Windows profile; browser trust must be visible outside package virtualization. Consent remains explicit. Do not bundle a CA/private key or silently import an existing CA.                                   |
| Consent and cleanup              | `lib.rs` checks installation/https-autosetup; NSIS hooks create it and launch --setup-local-https                                                             | Replace installer markers with an in-app setup choice. Provide scoped Remove local HTTPS trust and explain what persists after uninstall. Do not rely on an uninstall hook to revoke an OS root; revoke only our exact CA on explicit request, never unrelated certificates.                                                                                                                           |
| Processes and lifecycle          | Apache/MySQL spawn directly; current lib/tray exit calls app.exit; NSIS handles upgrade stop, preservation and uninstall                                      | Keep ordinary processes, not NT services. Add per-instance ownership, shared-workspace lock, graceful MySQL shutdown, Apache/PHP/terminal cleanup, crash recovery and package-update handling. Prove app close, tray quit, logout, forced termination and Store update behavior. Job objects may help; prototype carefully to avoid abrupt database termination on normal exit.                        |
| Process discovery and shells     | `utils/process.rs` shells to PowerShell CIM and taskkill; terminal.rs uses ConPTY/cmd/PowerShell; php.rs invokes mklink                                       | Prefer Windows process APIs for required lifecycle/discovery and direct runtime selection. Retain the terminal as a desktop feature subject to packaged testing; do not confuse full trust with S-mode compatibility. Document unsupported/restricted-device behavior; do not claim maximum-device support.                                                                                            |
| Application updates              | `commands/app_update.rs`, updater plugin and `src/context/updater-context.tsx` poll GitHub and can install an NSIS update                                     | Store mode must block GitHub application installation in backend/plugin permissions as well as UI. Show Managed by Microsoft Store and a Store link. Keep release information separately if desired. Optional PHP downloads remain a separately disclosed runtime feature.                                                                                                                             |
| Startup                          | `commands/system.rs` writes HKCU Run with current_exe absolute path                                                                                           | Use packaged StartupTask with user control and correct manifest declaration. Test persistence after package version changes and Windows-disabled startup state.                                                                                                                                                                                                                                        |
| WebView2 and native dependencies | Existing NSIS config uses downloadBootstrapper; package contains native Apache/MySQL/PHP dependencies                                                         | MSIX does not execute the NSIS prerequisite flow. Prove Evergreen availability/dependency handling or bundle a supported Fixed Version WebView2 runtime and maintain its security updates. Inventory CRT/native DLL dependencies on a clean machine; do not assume the development PC proves completeness.                                                                                             |
| Restore/migration                | fullbackup.rs uses user data paths, config/site locks and excludes CA keys; current NSIS and Store can overlap                                                | Import with preview and a recovery backup; do not share mutable state or simultaneously open a MySQL datadir. Preserve originals. Detect existing NSIS processes/ports, require graceful stop, map old runtime paths, and validate restored generated configuration. Prefer logical database export/import for cross-layout/version migration.                                                         |
| Website/listing                  | Live /privacy still describes PHP downloads as future functionality and denies background network activity; updater context has automatic checks              | Reconcile privacy, network destinations, updater behavior and screenshots against each channel's actual behavior. Explain any hostname differences clearly. Listing must describe implemented Store features only.                                                                                                                                                                                     |

### Proposed storage and runtime contract

- Package resources: immutable app, Apache/MySQL executables and modules, PHP 8.3
  seed, phpMyAdmin code, mkcert and templates. Resolve from package resources at
  runtime; never persist a package-version directory as a durable runtime ID.
- Application state: per-channel package state for settings and disposable cache.
  Resolve with supported APIs rather than assuming an environment variable is physical.
- Persistent workspace: user-selected ordinary folder, with a proposed default under
  the user's home directory such as DevStackBox. Keep projects, database storage and
  user-exported backups outside the package; test access with Explorer/editors and
  after uninstall. Store runtime downloads in a protected user-writable runtime area;
  choose exact location after identity/virtualization proof. Do not request broad
  virtualization exceptions merely to preserve the current folder layout.
- Runtime selection: one resolver returning exact executable, immutable identity,
  writable ini and extension path, used by CGI, CLI and diagnostics. Existing pins
  continue to select only installed, validated branches. Reject missing runtimes;
  never borrow another installation's PHP or fall back through system PATH.
- Keep upstream HTTPS/SHA-256 validation, staging and cancellation for PHP downloads.
  Disclose these as optional developer runtimes; assess Store policies against the
  submitted feature description. Store signing does not magically sign downloads.
- Retain configs/logs/databases through upgrade; define uninstall retention explicitly.
  Persist no credentials or local CA keys in public packaging artifacts. Preserve the
  existing private-CA backup exclusion. Do not share a CA with the development package.

### Implementation order and acceptance gates

1. **Feasibility proof first (no production migration).** Use an isolated Windows
   profile/VM, a separate development identity, separate data/workspace and ports.
   Build/stage a minimal full-trust Tauri MSIX with bundled PHP/Apache/MySQL.
   Verify launch as standard user, WebView2, native dependencies, external project
   access, PHP CGI, actual data paths and shutdown. Test project.localhost and
   localhost:port candidates, then opt-in current-user HTTPS with a test CA.
   Record browser and Windows-client DNS/trust behavior, not just curl --resolve.
   No production certificate import, hosts-file edit or existing app replacement.
   **Exit:** evidence confirms a viable core workflow; otherwise stop and report the
   exact blocker before a broad refactor. A locally working package is not certification.
2. **Storage/resolution refactor.** Implement explicit bundled/state/workspace roots,
   a runtime catalog and settings-backed global selection. Remove package writes,
   update project/runtime diagnostics, phpMyAdmin writable paths, starter files and
   permission errors. Scope channel behavior so the existing NSIS release is stable.
   **Exit:** read-only package tests plus simultaneous installed PHP CGI checks pass;
   HTTP and HTTPS requests demonstrate actual per-project PHP versions.
3. **Lifecycle and package update safety.** Implement instance/workspace locks,
   graceful shutdown, owned-child handling and generated-path rebasing. Include
   interrupted update/config recovery. **Exit:** package A-to-B update while services
   run preserves data and pins; no live config points to package A afterward.
4. **Hostname/HTTPS product decision.** Adopt only the standard-user naming strategy
   proven in step 1, with clear UX and migration preview. If .test automation is
   indispensable, prepare a Microsoft allowElevation justification for the user to
   review/send; do not assume consent or approval. No hidden helper workaround.
   **Exit:** supported hostname resolution, alias handling, browser HTTPS trust,
   refusal/revocation and expired-cert recovery work as documented.
5. **Store integrations.** Disable GitHub installer updates at all invocation layers,
   add Store update messaging and StartupTask, finish manifest/assets, prerequisites,
   license notices and CI packaging. Keep x64 only until other architectures are built
   and tested. Package versions use a valid four-part monotonic version and match
   Store constraints; do not assign/release a new public version just for this audit.
6. **Existing-user migration.** Separate import flow with backup and source-path
   preview; keep external projects in place. Copy verified runtime settings, map roots,
   import databases safely with services stopped and leave the old install recoverable.
   Define handling of an already-installed CA/hosts entries without deleting them.
   **Exit:** old NSIS-to-Store migration, rollback and conflicting-process tests pass.
7. **Certification preparation.** Resolve the Partner Center MSIX identity/name,
   recheck policies, finish listing/privacy/support and real screenshots, run package
   validation/WACK and the matrix below. Submit only after the user reviews the
   concrete candidate and reviewer instructions. No Store submission in this audit.

### Required test matrix before submission

- Supported Windows 10 and Windows 11 versions; standard user and admin account
  running unelevated; clean PC without development tools and with missing WebView2/CRT.
- Install, first launch, repair, package A-to-B update, uninstall/reinstall; no stale
  runtime paths, orphan processes, unexpected prompts or user-file loss.
- Spaces/non-ASCII paths, custom/external project directories, unavailable drive,
  read-only folders, offline/cancelled/interrupted PHP download and disk-full failure.
- Bundled PHP plus a downloaded branch concurrently through HTTP and HTTPS; global
  switch, pinned project, extensions, phpMyAdmin, terminal/CLI effective version.
- Website returns expected HTTP status separately from certificate trust; localhost,
  proposed project hostnames/aliases and custom ports in Edge/Chrome plus other
  supported browsers/CLI clients. Firefox trust must be tested separately.
- Existing XAMPP/NSIS processes and occupied ports; two app instances/channels must
  never open one database directory concurrently or stop unrelated processes.
- Database durability across graceful close, crash, forced package shutdown/update,
  migration and restore; full backup excludes CA keys and operation locks.
- HTTPS setup accepted/declined, per-user isolation, revocation and CA-key ACLs;
  confirm browser-visible trust and deliberate cleanup after package uninstall.
- Store-managed update path cannot invoke GitHub NSIS installation; StartupTask
  respects Windows controls; light/dark, keyboard focus and minimum window size.

### Scope of this audit and sources

This is static source inspection plus current primary-documentation research. No MSIX
was built/installed and no packaged behavior or certification approval is established.
No application tests were run because application code did not change. Validate the
proof separately rather than describing the checklist as passed. Windows SDK 10.0.26100
MakeAppx exists locally; signing/testing tools and environment still need qualification.
The policy page retrieved is version 7.20, published 15 September 2026 and effective
22 October 2026 (after this audit); recheck the effective policy at submission time.

- [Microsoft Tauri MSIX guide and Store signing](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/tauri)
- [MSIX preparation constraints](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare)
- [Desktop package runtime and filesystem behavior](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes)
- [Restricted capabilities; allowElevation requires advance justification](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
- [AppData virtualization, visibility and uninstall](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization)
- [Current-user certificate store API](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-certopensystemstorew)
- [mkcert Windows trust implementation v1.4.4](https://github.com/FiloSottile/mkcert/blob/v1.4.4/truststore_windows.go)
- [Packaged StartupTask](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.startuptask)
- [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)
- [MSIX product/name reservation](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name)
- [Store policies; confirm effective version when submitting](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
