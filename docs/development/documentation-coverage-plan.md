# App documentation and screenshot coverage audit

Audit date: 2026-10-23. Published app baseline: v0.1.17. Scope: current app source, active documentation, website content preparation, image rendering and existing validation. This is an implementation plan, not a new release or a claim that every workflow has been exercised on a clean machine.

## Finding

Documentation does **not** yet cover every app screen at a complete user-guide level. Installation, project folders, per-site PHP and HTTPS have useful guidance. Several other features appear only in technical command tables, feature-status lists or scattered troubleshooting paragraphs. Those mentions do not explain how a user completes the task, recognizes success or recovers from an error.

- Nine top-level workspaces appear in the sidebar.
- `src/lib/routes.ts` defines 28 route entries. Excluding the `/logs` redirect and adding `/projects/:projectId` gives **28 routed screens**. Legacy redirects and the catch-all are not additional screens.
- `docs/navigation.ts` exposes 26 MDX pages, many intended for contributors rather than app users.
- Only `docs/index.mdx` currently embeds an app screenshot. It uses the new native 1920 × 1032 Services capture.
- The website also uses three older 1202 × 831 project captures. Historical labeling is present, but missing detail cannot be recovered by enlargement.
- Important non-route flows include onboarding, root-password guidance, project connection, SQL restoration, database/user confirmations, configuration history, updater dialogs, command palette and tray actions.

The earlier build and 39-page HTTP smoke results establish that the existing pages render and their checked links work. They do not establish complete feature coverage, correct prose or usable image zoom on desktop and mobile.

## Coverage standard

A screen is covered when a user can find its guide and understand its purpose, prerequisites, navigation path, controls, scope of changes, expected result, common failures and recovery. A representative screenshot or a documented shared screenshot should support unfamiliar controls. Screenshots supplement readable steps; they must not carry the only instructions.

Each row below records current task-level coverage. “Partial” means some useful guidance exists but does not meet this standard. “Missing guide” allows that the feature is mentioned in a technical reference or feature list.

## Screen-by-screen inventory

Proposed `user-guide/` paths below are future MDX pages, not existing links.

| # | Screen / route | Current coverage | Documentation work | Capture / reuse |
| --- | --- | --- | --- | --- |
| 1 | Dashboard `/` | Missing guide; feature list only | `user-guide/dashboard`: start/stop all, status versus PHP readiness, runtime patch labels, project links and recent logs | Clean dashboard with a demonstration site and no personal logs |
| 2 | Services `/services` | Partial: installation + feature status | `user-guide/services`: individual/bulk controls, workspace links, overflow/context menus, port errors | Reuse existing v0.1.17 HD Services capture for released behavior |
| 3 | Apache overview `/services/apache` | Partial: configuration/networking | Services guide: actual port, localhost versus project hostname, phpMyAdmin prerequisites, HTTPS entry | Apache overview matching the documented build |
| 4 | Apache logs `/services/apache/logs` | Partial: troubleshooting/project log notes | `user-guide/logs`: file source, refresh, search, auto-scroll and clear-display semantics | Shared Apache log-viewer capture |
| 5 | Apache config `/services/apache/config` | Partial; troubleshooting describes a nonexistent default-restore control | `user-guide/configuration-editor`: read, validate/save, restart, history restoration and failure behavior | Editor plus saved-backup selector; demonstrate invalid input only in a disposable profile |
| 6 | Virtual Hosts `/services/apache/vhosts` | Partial: project guide | Extend project guide: relationship to Projects, enable/disable, disconnect, aliases and hosts-file updates | Reuse project connection/details where controls match; capture advanced list when different |
| 7 | HTTPS `/services/apache/ssl` | Partial: project guide + LOCAL-HTTPS.md | `user-guide/local-https`: localhost setup, per-site certificates, trust, repair and diagnostic outcomes | HTTPS overview; legitimate trust prompt only when part of an actual demo operation |
| 8 | MySQL overview `/services/mysql` | Partial: networking/configuration | Services guide: port/version/status, phpMyAdmin and config/log entry points | MySQL overview |
| 9 | MySQL logs `/services/mysql/logs` | Missing task guide | Logs guide: MySQL source and startup/authentication errors | Shared log-viewer guide with MySQL-specific text; separate screenshot only if needed |
| 10 | MySQL config `/services/mysql/config` | Partial: paths/port reference | Configuration-editor guide: `my.cnf`, validation, restart and recovery | Reuse shared editor capture, document service-specific settings |
| 11 | PHP overview `/services/php` | Partial: FAQ/configuration | `user-guide/php`: PHP readiness, global branch/patch, info action, extensions and ini entry points | PHP overview |
| 12 | PHP extensions `/services/php/extensions` | Missing task guide | PHP guide: active/global runtime scope, filter, built-in modules, toggle and Apache restart; pinned-runtime limits | Extensions list with representative built-in and switchable entries |
| 13 | PHP ini `/services/php/config` | Partial: preservation and paths | Configuration-editor + PHP guides: user copy, managed settings, pinned ini files and actual apply behavior | Shared editor plus PHP-specific caption/example |
| 14 | PHP Versions `/services/php/versions` | Partial; troubleshooting contradicts implementation | PHP guide: download, progress/failure, patch upgrade, activation, bundled/global/project distinctions and unsupported branches | Current version list and one real operation/error state if reproducible |
| 15 | Projects `/projects` | Partial: existing project guide | Complete connect versus create behavior, external folders, enable/disable, open/manage/disconnect and empty state | Retake Projects and connection dialog in HD |
| 16 | Project details `/projects/:projectId` | Strongest partial guide | Complete editable fields, aliases, folder versus docroot, HTTP/HTTPS checks, runtime selection, logs and configuration-review recovery | HD details plus PHP selector and relevant health state |
| 17 | Databases `/databases` | Missing task guide | `user-guide/databases`: service/auth requirements, create, refresh/search, open phpMyAdmin, export and delete confirmation | Demo database list + create/delete dialog |
| 18 | Database users `/databases/users` | Missing task guide | Databases guide: username/host scope, create, password change, delete and root account implications; document actual grant behavior | Demo users list + form; no real credentials |
| 19 | Database backups `/databases/backups` | Partial: feature list/release notes | `user-guide/database-backups`: individual/all-database dumps, destination, file restore modes, PHP upload limits versus native import, partial failure | Backup screen + SQL restore in both modes |
| 20 | Apache logs `/logs/apache` | Partial | Logs guide; explain shared viewer and why logs can include several sites | Reuse Apache log capture with both navigation paths documented |
| 21 | MySQL logs `/logs/mysql` | Partial | Logs guide; show which file is read and what missing/empty output means | Reuse viewer; add service-specific example |
| 22 | PHP logs `/logs/php` | Partial: project runtime log notes | Logs guide; global versus pinned runtime logs, configured destination and timestamp attribution | PHP log capture using harmless demo output |
| 23 | Terminal `/terminal` | Feature list; global-PHP limitation documented | `user-guide/terminal`: shell availability, create/switch/close tabs, shortcuts, working directory, persistence/lifetime, global PHP and CLI auth | Terminal tabs with harmless commands and a clean demo prompt |
| 24 | Security `/security` | Feature list only | `user-guide/security`: actual checks, severity, expanded recommendation, config links, MySQL access limits and rescan; distinguish checks from a comprehensive vulnerability audit | Scan results with one expanded finding and no personal configuration |
| 25 | General settings `/settings` | Feature list + upgrade notes | `user-guide/settings`: theme/language, login launch, service auto-start, close-to-tray, update checks/channel and when changes apply | General settings; additional scrolled capture if needed |
| 26 | Full backup `/settings/backup` | Partial: upgrade/project notes | `user-guide/full-backup`: included/excluded contents, MySQL-skipped result, location/list/delete, restoration effects and recovery | Backup overview + restore confirmation using a disposable backup |
| 27 | XAMPP import `/settings/xampp-import` | Partial: website migration guide + FAQ | Add app-docs `user-guide/xampp-migration`, keeping website landing content concise: detected path, copy/skip behavior, external-folder alternative and separate SQL migration | Import screen with clean demo source; no changes to the user's XAMPP |
| 28 | About `/about` | Feature list only | Settings/support guide: installed app/runtime versions, system information, updates and bug-report details | About/system information; exclude any personal details |

Shared screens need shared instructions, not duplicated guides that drift. The `/logs` landing redirect and old `/ssl`, `/vhosts`, `/backup`, `/mysql-users` routes should be recorded as aliases in the inventory, not promoted as current navigation.

## Dialogs and actions outside the route inventory

| Flow | Required guide coverage | Screenshot decision |
| --- | --- | --- |
| First-run welcome | Installation/first run: bundled services, Explore first versus Start all, what dismissal means | Capture on a clean profile |
| Root-password prompt | Database/security guide: what the prompt detects, destination, dismissal and existing-password limits | Capture a disposable local account state |
| Add project / site | Project guide: every field, folder/docroot selection, hostname validation, duplicates and cancel/save | Required HD form capture |
| Project disconnect or configuration review | Project guide: saved-site versus file effects, repair/reconnect workflow, backups | Capture a real example only; explain in text if unavailable |
| Create/drop database | Databases guide: defaults, confirmation and data effects | Demo forms; never delete a real database for a screenshot |
| Create user/change password/drop user | Databases guide: account host, permissions actually granted, confirmation and application credentials | Use demo accounts, keep password masked |
| SQL restore dialog | Database-backup guide: follow dump versus initial database, CREATE/USE behavior, new/existing database and partial import | Two required states; verify by restoring only disposable SQL |
| Configuration history and confirmation | Configuration-editor guide: backup selection, what is saved, validation and restart | Required history capture, can be reused for three services |
| Full-backup restore/delete | Full-backup guide: destructive effects, exclusions, failure handling and recovery | Confirmation capture without executing against user data |
| Update indicator/dialog | Upgrade guide: check, no update, download/progress, verified install/relaunch and failure | Capture real available states; do not invent an available release |
| Command palette | Dashboard/settings guide: `Ctrl+P`, navigation versus action commands, close/keyboard behavior | One capture; verify commands actually do what their labels say |
| Tray menu and close/quit | Settings/services guide: show/hide, controls, close-to-tray and actual quit/service behavior | Native tray capture when useful; do not infer behavior from labels alone |
| File/folder pickers and HTTPS trust | Respective guides: selection/cancel and expected Windows prompt | Include only prompts that add useful guidance; avoid redundant stock dialogs |

## Confirmed corrections to prioritize

| Priority | Evidence | Correction |
| --- | --- | --- |
| P0 | `docs/advanced/troubleshooting.mdx:188` calls PHP download a stub; `src-tauri/src/commands/php.rs:737` implements downloads | Replace with current download/update failure and recovery steps; distinguish network, verification and file-lock failures |
| P0 | Troubleshooting line 126 tells users to use “Restore Default”; `workspace-config-editor.tsx:144` provides “Restore a saved backup” | Describe controls that exist, backup prerequisites and missing-config recovery verified against backend behavior |
| P0 | `src/pages/databases/backups.tsx:169` and `locales/en.json:379` say full-stack backups include logs; `fullbackup.rs` collects config, www and optional SQL, not logs | Correct the UI copy and all linked backup descriptions; account for excluded HTTPS/SSL material and external folders too |
| P0 | Troubleshooting lines 194–224 mixes legacy MSI instructions into current guidance, including disabling antivirus and uninstall-first advice | Write current NSIS diagnosis based on actual logs and files; put MSI history in the archive. Replace broad workarounds with diagnosis and recovery that preserve user data |
| P1 | Troubleshooting line 369 treats phpMyAdmin 5.2.1 as the current bundle; `phpmyadmin/package.json` reports 5.2.2 | Reassess compatibility against the actual bundle; mark old mitigation history clearly, without assuming every compatibility issue is resolved |
| P1 | Troubleshooting combines end-user errors, old technical-debt statuses and a manual Apache binary replacement guide | Separate current user recovery from contributor/history material; audit remaining old paths, commands, issue references and log instructions |
| P1 | `docs/roadmap.mdx:61` says “Next (after v0.1.14)” while its current-release section says v0.1.17 | Reconcile active headings/statuses without rewriting historical milestones as current work |
| P1 | Feature lists and command tables are sometimes the only “documentation” for a screen | Add task guides and link each screen/workflow to its canonical guide; do not count a command-name mention as user coverage |

P0 here means correction priority for this documentation effort; it is not a claim of a newly discovered critical runtime vulnerability. These findings were confirmed by source comparison, not by reproducing every error in the installed app.

## Documentation structure and source ownership

1. Keep installation, upgrading and the project guide at their existing URLs. Extend them rather than breaking inbound links.
2. Add a **Using DevStackBox** sidebar section for the proposed user guides in the inventory. Combine related short topics; a screen does not require a separate page when a section provides complete coverage.
3. Keep paths/defaults in `reference/configuration.mdx`; task guides link to it instead of copying details repeatedly. Keep command signatures and implementation architecture in contributor/reference material.
4. Update `docs/index.mdx`, `docs/navigation.ts`, FAQ, README entry links, relevant root Markdown and website migration/feature content together. Distinguish published v0.1.17 behavior from pending source-only copy changes.
5. Reconcile `docs/LOCAL-HTTPS.md`, `PROJECT-ROADMAP.md`, feature status, roadmap, release validation and release runbooks with their intended audiences. Preserve ADRs and release history as historical records. Archive obsolete instructions only after checking references; do not delete useful recovery/release evidence.
6. Every new guide gets prerequisites, exact menu names, numbered steps, expected result, limitations and recovery links. Avoid placeholders, invented features and promises that “all settings/files” survive when exceptions exist.
7. English remains the current website documentation language. Verify corresponding English/Hindi UI wording when copying labels, and do not imply the website already has translated guides.

## HD capture plan

### Prepare the right build and data

- Inventory screenshots against the exact installed release or source revision before capture. The existing Services HD image is a released-v0.1.17 capture. Pending copy changes need a separately identified preview build; do not present that build as a released update.
- For a public documentation refresh before the next release, show released behavior and explain any changed label in text. Keep screenshots of unreleased behavior held until their version context is clearly identified and appropriate to publish.
- Use a dedicated demo profile/VM, clean local project outside `www`, a Laravel-style `public` docroot and disposable databases/accounts/SQL. Keep the user's active projects, services, backups and XAMPP separate from capture setup.
- Confirm services, versions and example responses in the actual app. Do not paint statuses or version numbers onto images. A browser-only mock preview is not evidence that backend workflows work.

### Capture and review

- Use native 1920-pixel-wide or larger captures where available; 2560-pixel-wide captures are useful when they preserve readable controls. Resolution alone is not quality: choose Windows scaling so the UI is legible at normal viewing size.
- Prefer PNG when a lossless capture path is available. The current native capture tool returned JPEG; preserve and label original JPEG honestly if that remains the available format. Conversion to PNG or upscaling does not restore lost detail.
- Retake the three old Projects/details/PHP images first, then cover the highest-impact workflows: PHP versions/extensions, SQL restore, full backup, config history, HTTPS and security. Complete the other rows afterward.
- Use a consistent theme, language, window size and dataset. Capture individual scrolled sections where a whole page cannot fit; avoid long stitched images with unreadable text.
- Exclude personal paths, credentials, unrelated windows, notifications, transient overlays and real logs. Retake unsuitable images rather than obscuring essential controls.
- Review at 100% pixels and at actual website display widths. Capture one image for identical shared components and reference it from each relevant guide with accurate context.

### Asset record

Create one approved screenshot manifest, preferably under `docs/images/`, recording stable asset ID, source file, native dimensions, format, app version/source revision, capture date, screen/route, language/theme, alt text, caption, target guides and approval status. Use descriptive filenames such as `php-versions-v0.1.17-1920x1032.png` only when that version, size and format are true.

Keep unreviewed captures outside public assets. Reuse approved originals across docs and marketing. Do not auto-publish every file in a capture directory. Retain old assets only while references or historical documentation need them.

## Website integration work

### Already in place

- `scripts/prepare-content.mjs` imports app MDX, navigation and selected root Markdown; docs are maintained in the app repository.
- `scripts/docs-transform.mjs` resolves documentation links and approved image-style paths into `/docs-images/`.
- Marketing `ProductImage` supports enlargement and original-image links, takes native dimensions and avoids extra Next.js compression for those images.
- Docs have sidebar/mobile navigation, search, table of contents, previous/next links, metadata and edit links. Existing HTTP smoke tests cover routes, links, assets, sitemap and basic search availability.

### Gaps to close

1. **Asset copying:** preparation currently copies only three hard-coded image filenames and only from the top-level images folder. A new screenshot is not automatically safe to reference. Replace this with the approved manifest; validate every referenced source, dimension and destination before replacing generated output. Support approved subfolders deliberately.
2. **Documentation image rendering:** `mdx-components.tsx` uses Fumadocs' default `img` renderer, not the marketing `ProductImage` dialog. Provide a consistent accessible screenshot figure/viewer for documentation, with caption, alt text, native ratio, keyboard close/focus return and original link. Preserve ordinary non-screenshot image handling.
3. **Size metadata:** marketing images still default to 1202 × 831 unless explicitly supplied. Source dimensions must come from the asset record; prevent wrong aspect ratios and layout shifts when images are replaced.
4. **One source per asset:** current Services copies in docs and marketing have matching hashes, but manual copies can diverge. Generate or copy from the same approved source for both destinations and verify hashes.
5. **Long-guide usability:** check mobile sidebar, table of contents, wide tables, code blocks, captions, light/dark contrast and readable zoom at 360/390, 768, 1440 and 1920 CSS-pixel widths. No horizontal page overflow or stretched screenshots.
6. **Search quality:** test task queries such as “restore SQL”, “external folder”, “PHP extensions”, “root password” and “close to tray”; a 200 response alone does not establish useful results.
7. **Published source revision:** hosted builds clone the app repository at `DEVSTACKBOX_REF` (default main), while local builds read local files. Publish/pin the matching docs and asset revision before website deployment; record the source commit. Local-only screenshots will not exist on the host.
8. **Dates and edit links:** the hosted clone is shallow and dates come from Git history; verify whether it yields meaningful per-page modification dates. Keep “last updated”, “verified against app version” and capture date distinct. Confirm edit links intentionally target the maintained branch when deployed docs are pinned elsewhere.
9. **Markdown portability:** the source image links should still work in repository viewers. Avoid making raw GitHub MDX unreadable solely to add a website component; use a compatible transform or explicit documented fallback.

## Execution order

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| 1. Correct contradictions | P0 prose/UI corrections, reconciled active troubleshooting and backup scope | Every correction traced to code/runtime evidence; existing useful history preserved |
| 2. Complete user guides | Canonical guides/sections covering all 28 screens and listed dialogs | Every inventory row links to a guide and has prerequisites, steps, expected result and recovery |
| 3. Prepare media pipeline | Approved asset manifest, reference checks, shared docs/marketing rendering | Missing or mismatched screenshot references fail preparation/validation; existing assets still resolve |
| 4. Capture and integrate | Reviewed native HD images with real version provenance and captions | Each row has an approved capture, deliberate shared capture or justified text-only treatment |
| 5. Verify workflows and presentation | Task walkthroughs in isolated app profile; website desktop/mobile/browser review | Documented tasks succeed or accurately document supported limitations; no clipped or illegible presentation |
| 6. Handoff for publication | Updated audit matrix, validation results and pinned docs/assets revision | No placeholders, unsupported feature claims or unlabeled unreleased screenshots; deployment remains a separate action |

Media pipeline work can precede final screenshots so filename and rendering assumptions do not cause retakes. Capture after wording and layout stabilize. Do not bump the app version merely to write documentation.

## Acceptance checks

- All 28 routed screens and non-route workflows above have explicit coverage or a documented shared-guide mapping. A new route should require a coverage decision in future changes.
- Route inventory includes actual App routes and dynamic project details, not just the sidebar. Command palette/tray behavior is checked separately.
- App checks and docs validation pass; any UI copy changes compile and translations stay consistent.
- Website lint/tests/build pass; smoke routes expand with new docs rather than staying fixed at 39.
- Tests reject missing assets, wrong native dimensions, stale manifest references and broken nested documentation image URLs. Test captions/original links in built output.
- Browser checks cover image load, enlargement, Escape/close, focus return, scroll behavior and original links on desktop/mobile. Run contrast and keyboard checks on the actual built website.
- Walk through important guides on the real app: connect external project, Laravel docroot, global/pinned PHP, extension change, config validation/history, SQL export/import modes, full backup exclusions/restoration, HTTPS diagnosis and service logs. Use disposable data for any changes.
- Older screenshot labels, release metadata, signatures and downloads remain truthful. No release, update channel, live site deployment or deletion is part of this audit.

## Audit limits

This pass inspected source and documentation. It did not retake screenshots, execute destructive dialogs, change app behavior or deploy the website. Browser automation was unavailable in the previous pass; interactive browser review remains an explicit acceptance gate, not an assumed pass. Future capture feasibility and state-specific runtime behavior must be verified while implementing the plan.
