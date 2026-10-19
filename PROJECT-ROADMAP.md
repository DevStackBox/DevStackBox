# Project workspace roadmap

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

## Diagnostics follow-up — 19 October 2026 (v0.1.13)

- Project details reads Apache errors and the PHP log matching the saved pinned runtime; global-default projects use the global PHP log. These logs are shared, not isolated per project.
- Log-reading failures remain visible. Empty or old logs do not establish website health, and custom log destinations may differ.
- PHP selection is explicitly a saved setting, not a verified measurement of live website PHP.
- Before site edits mutate files or restart services, reject generated hosts absent from both old and incoming site records. Permit deliberate removal/rename and reconnection; never silently erase unrelated orphan hosts.
- Still unresolved: the cause of the observed saved/generated configuration divergence and stale Apache log. No automatic recovery or repair of the installed configuration was attempted.
- Laravel files, dependencies, and environment remain untouched. These changes target v0.1.13 and are not in the v0.1.12 installer.
- Site snapshots now fail on unreadable files instead of treating them as absent. Site config writes use staged replacements, with persistent pre-change recovery copies in the configuration backups directory. This is not a crash-atomic transaction across all files.
- Configuration editor writes and full-backup restoration share the site-operation lock to prevent those operations racing with site updates.
- Validation: 27 frontend tests, 33 Rust tests, TypeScript and documentation checks passed. Live isolated Apache reproduction was blocked by automatic approval review; the installed HTTP 500 is not claimed fixed.

## Microsoft Store readiness — proposed, not submitted

Use the existing EXE installer route first, subject to certification. MSIX would require a separate compatibility effort around writable runtimes, installation paths and privileged hostname operations.

1. Register and verify the publisher in Partner Center and reserve the app name.
2. Inventory Authenticode signatures for the installer and all bundled PE binaries (including third-party EXEs/DLLs); satisfy Microsoft's signing requirements. Tauri updater signatures are separate.
3. Build a fully offline Store installer. The current WebView2 `downloadBootstrapper` setting needs an offline alternative.
4. Verify silent installation, upgrade, uninstall and exit codes on clean Windows machines. The current installer automatically invokes local HTTPS setup when selected; the Store silent path must defer interactive certificate trust setup until the user explicitly enables it in the app.
5. Publish an immutable, versioned HTTPS installer URL; supply its silent-install parameters, listing, screenshots, support/privacy information and reviewer instructions in Partner Center.
6. Submit for certification, then test installation through the Store. Do not replace the published v0.1.12 binary; use a new release version for new fixes.

Store publication does not sign the separate GitHub EXE automatically. It also does not remove the need for user consent for privileged changes or local certificate trust.

References: [EXE/MSI requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements), [MSIX compatibility](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare), [publisher registration](https://learn.microsoft.com/en-us/windows/apps/publish/get-started).
