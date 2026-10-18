# Trusted local HTTPS, virtual hosts, and Projects plan

Status: proposed implementation plan; no TLS, trust-store, hosts-file, installer, or application behavior changed in this planning pass.
Date: October 17, 2026

## 1. Intended outcome

A normal installation prepares trusted HTTPS for localhost automatically. After Apache starts, https://localhost and https://localhost/phpmyadmin load without a certificate interstitial. Adding or connecting a project creates its local hostname and HTTPS configuration in one flow. Users do not manually run OpenSSL, mkcert, certutil, or edit Apache configuration.

The acceptance criterion is a valid, trusted connection without browser warnings, not a literal green padlock: browser security indicators differ. App-owned pages must also avoid mixed content; arbitrary imported applications may need their own base URLs/assets changed.

## 2. Findings from the current checkout

- `src-tauri/src/commands/ssl.rs` uses bundled OpenSSL to create a private CA and a 10-year localhost leaf certificate. It appends enabled virtual-host names to the leaf SAN list at generation time. HTTPS virtual hosts all reuse this certificate.
- Adding/removing/toggling a vhost writes JSON and HTTP configuration through `vhosts.rs`, but does not reconcile certificates and HTTPS configuration. New names can be absent from the certificate; deleted hosts can remain in stale TLS configuration.
- SSL status checks file existence/configuration strings and current-user root-store presence. It does not prove the active listener serves the expected certificate or correct project.
- The inspected local leaf covers only localhost, 127.0.0.1 and ::1. Its CA is absent from the current account's Root store. A read-only `curl.exe --head https://localhost/` failed with Windows signature verification error 0x80096004. The actual served chain must be inspected before attributing the exact browser warning to one cause. No bypass flags were used.
- `nsis/hooks.nsh` POSTINSTALL initializes PHP linking but leaves Apache configuration to first start. It does not provision HTTPS. The installer is per-machine, while app configuration and current trust operations are per-user: elevation under another account must be handled explicitly.
- `src/pages/projects.tsx` only lists www folders and tells users to visit Virtual Hosts. There is no persistent project-to-site relationship or unified HTTPS action.
- Vhost duplicate comparison is case-sensitive. Corrupt JSON silently becomes an empty list. Writes are not transactional. Hosts removal can remove matching unmanaged lines; the system directory is hardcoded.
- Apache currently generates more than one localhost HTTP vhost in some configurations. TLS binds port 443 on all interfaces. These need a deliberate localhost-only configuration and one default vhost per listener.

## 3. Recommended technical decisions

### Certificate provider

Use a pinned, verified mkcert Windows binary for local CA and leaf issuance, with a DevStackBox-owned CAROOT. Bundle the binary and its license so local HTTPS provisioning works offline; do not download an unpinned executable during install. Keep Apache as the server: mkcert does not configure it or manage DNS/hosts entries.

Keeping the existing OpenSSL CA can also work, but leaves more certificate lifecycle and trust integration code to maintain. Caddy would introduce a second server/proxy and still require local trust. Public ACME is not the default solution for localhost or reserved .test names. Recommendation: mkcert plus one DevStackBox orchestration layer, gated by a Windows installer prototype before the full migration.

Use a separate leaf certificate per site (including aliases), with a dedicated localhost certificate containing localhost, 127.0.0.1 and ::1. Adding a project must not regenerate the localhost key or break unrelated sites. No catch-all certificate for every project and no wildcard in the initial release. Use the pinned provider's normal certificate lifetime; renew automatically before expiry, e.g. within 30 days, while the app is running. On next launch repair expiry before advertising readiness.

### Hostname policy

Default and normal creation flow: `project.test` with optional explicit aliases such as `www.project.test`. .test is reserved for testing. mkcert is not restricted to any particular TLD.

Do not default to .local (multicast DNS) or .host (public delegated TLD). Existing names remain visible and can be migrated without an automatic rename. Initially allow new managed project names only under .test; localhost is a protected system site. A later advanced custom-domain feature can deliberately opt into public-domain overrides. Do not silently take over real domains.

Normalize case and surrounding whitespace, validate DNS label lengths, reject URLs/ports/paths/control characters, and detect alias conflicts globally. Use stable IDs for filenames rather than interpolating arbitrary domains into paths or scripts. Explain duplicate names inline before provisioning.

### Trust ownership and installer identity

Preferred initial model: one private CA per Windows user/device, private keys readable only by that user and required system principals. Do not ship a CA private key, reuse a global mkcert CAROOT, export it in support logs, or include it in ordinary project backups. A locally trusted CA is not automatically restricted to .test; UI must accurately explain the trust being installed.

Installation offers an enabled-by-default, clearly explained “Set up trusted local HTTPS” option. The installation flow runs a provisioning helper in the original interactive user's context, even when installation elevated using another administrator's credentials. Generate the CA and trust its public certificate for that user, configure localhost, and persist a structured result. Do not merely run mkcert under the elevated account and assume the browser user is covered.

Prototype and test this identity handoff first. If per-user provisioning cannot finish, show the exact reason and provide one Repair HTTPS action; never report HTTPS ready. Managed-device policy or a declined trust prompt cannot be bypassed. A machine-wide CA would require a privileged issuance service with restricted keys, and is intentionally outside the first implementation. Other Windows accounts require their own first-use provisioning; do not promise all-account readiness from one user's installation.

## 4. Installer and localhost flow

1. Install verified binaries; resolve the real installation path and original user identity.
2. Provision that user's CA and explicit trust, preserving valid existing state on upgrade.
3. Issue localhost leaf, initialize base Apache/PHP configuration without requiring a prior manual Apache start, and stage one localhost HTTP and one localhost HTTPS vhost.
4. Bind local listeners to loopback by default, including IPv6 where enabled. Check 80/443 conflicts and report the owning service. Never terminate unrelated applications. Offer an explicit alternate HTTPS port with correct URLs when necessary.
5. Validate configuration with the installed httpd. A crash, empty nonzero result, or syntax failure is failure, not permission to proceed.
6. Start Apache as part of the normal selected install/launch flow and verify trust, SANs, chain, expected certificate fingerprint, hostname, and app-owned response. If Apache is intentionally not started, report “Configured; Apache stopped”, not “Verified”. No manual SSL steps are needed on the successful default path.
7. Show installation completion with “Local HTTPS ready” only after verification; preserve a diagnostic result for the app. Browser restart may be needed after trust changes.

## 5. Project and virtual-host UX

Projects becomes the main entry point. Provide “Create project” for a simple empty folder and “Add existing folder”; automatic framework downloading/scaffolding is a separate scope. Imported XAMPP folders can be connected using the same flow without moving files or importing databases.

Form: project name, folder, document root, suggested project.test hostname, aliases, and “Enable HTTPS” on by default. Suggest `public/` for supported framework layouts but require a visible choice; never expose a Laravel project root containing .env by default. Show the final URL before Create.

One Create/Connect action performs validation, hostname mapping, certificate issuance, config generation and activation. Show specific progress and any Windows permission prompt explanation. Standard users may still need UAC for hosts-file changes; zero manual setup does not mean zero OS authorization prompts.

Project cards show folder, document root, URL, Apache state, and verified HTTPS state. Actions: Open site, Open folder, Manage hostname, Check/Repair HTTPS. Discovering a folder alone does not claim it is a configured site. Allow multiple site mappings per project through advanced management.

Virtual Hosts remains an advanced Apache view over the SAME site records, not a separate database. Editing either screen updates the other. HTTPS settings becomes a health overview with localhost and per-site rows, not three disconnected Generate/Enable/Trust steps. Use “Trusted HTTPS”, “Apache stopped”, “Setup required”, “Trust missing”, “Hostname conflict”, “Certificate expired”, or “Verification failed” with a concrete repair action. A green app badge is permitted only after verification for that hostname.

Removing a site removes its managed routes/hosts mapping and retires its leaf; it never deletes project files. Disable removes it from active HTTP/TLS routes consistently. Offer HTTP-to-HTTPS redirect per site only after verification; no default HSTS for development. Avoid redirecting localhost by default until existing workflows are tested.

## 6. Data and transaction design

Introduce versioned project/site records: stable project ID, project root, site ID, hostname, aliases, document root, enabled, HTTPS desired state and redirect preference. Certificate metadata references site ID, issuer fingerprint, expiry and SANs; private keys never go to frontend state. Derived health includes resolution, trust, certificate validity, Apache state, applied configuration revision and last verification time.

A single reconcile operation builds HTTP/TLS config from these records. Serialize writes, stage files, validate syntax, snapshot affected managed state, update hosts using a narrow authenticated helper, activate/reload, and run health probes. On failure restore the previous configuration and owned mappings; clean staged leaf artifacts. Trust installation is a separate durable prerequisite, not something repeatedly added and removed for project transactions.

Use Windows APIs/system directory resolution, not C:\Windows assumptions. Only edit the DevStackBox hosts block, preserve unmanaged content/comments/encoding, detect conflicts outside the block, and handle malformed/duplicate markers explicitly. Do not silently treat corrupt state as no sites. Ensure concurrent operations cannot overwrite another user's or process's changes.

Use Windows trust validation for live probes, not only verification against a manually supplied CA file. Check SNI and content routing with at least two simultaneous projects. Use explicit port/hostname parameters in rendered vhosts rather than string-replacing HTTP blocks. Keep phpMyAdmin scoped to localhost unless separately configured.

## 7. Existing installations, renewal, and uninstall

Inventory the existing CA, leaf, vhost definitions and active served certificates. Preserve existing sites and manual files. Stage new mkcert state in a separate directory, install trust, issue leaves, validate and switch atomically. Keep rollback state. Never silently discard a CA key or remove trusted roots by display name.

Track installed CA fingerprints and ownership. After successful migration, offer removal of the old DevStackBox CA only when no managed sites depend on it; retain it if ownership/dependencies are uncertain. Upgrade reuses the new CA and site mappings. Certificate renewal must be atomic and recover after interruption. Uninstall separates project/data preservation from trust removal, handles the correct user identity, and documents retained trust; never uninstall another tool's CA.

## 8. Test matrix and release gates

| Area | Required cases and passing result |
| --- | --- |
| Fresh installation | Clean Windows 11 and supported Windows 10 baseline; offline HTTPS setup; default install then localhost and phpMyAdmin open with no certificate warning |
| User identity | Same-account elevation, standard user entering another admin's credentials, second Windows account, denied trust/UAC, managed policy; no false success or misplaced keys |
| Browsers | Current Edge, Chrome, Firefox default profile and fresh profile, browser already open during setup; test OS-root trust disabled/policy-restricted Firefox as an explicit unsupported/repair state |
| Localhost | localhost, IPv4, IPv6 where bound; correct SAN and valid chain, real PHP execution, phpMyAdmin, no app-owned mixed content |
| Projects | Empty project, existing PHP, framework public root, imported XAMPP folder, paths with spaces/non-ASCII, two simultaneous projects, optional alias; correct document root over HTTP and HTTPS |
| Lifecycle | Add after localhost SSL already exists, edit hostname/root, enable/disable, delete mapping, renew, restart app/Apache, reboot, upgrade, interrupted migration; other sites remain healthy |
| Failures | Port conflicts, corrupt JSON, missing key, expired/wrong-SAN certificate, wrong active certificate, untrusted CA, blocked hosts write, failed httpd syntax/start/reload, missing provider, wrong clock; actionable errors and rollback |
| Isolation | No accidental LAN listener, no phpMyAdmin exposure on project hosts, no edits to unmanaged hosts lines, no private keys in logs or normal backup/export |
| UI/accessibility | Keyboard-only forms/dialogs, focus restoration, pending/error/retry states, English/Hindi, light/dark, minimum app window size; no stale Ready badge |

Automate Rust tests for hostname normalization, schema migration, SAN selection, config generation, hosts edits and rollback. Add frontend tests for unified create/repair flows and health labels. Run installer/integration tests in disposable Windows VMs with real trust verification; do not use curl -k, browser ignore-certificate-errors, or trust-bypass settings to claim success. Capture browser certificate details and hostname-specific successful responses for release evidence.

## 9. Implementation order

1. Reproduce the current warning: record browser error code, inspect actual served chain/SAN/fingerprint and account trust, identify listener ownership and stale config.
2. Prove pinned mkcert packaging plus installer original-user provisioning in disposable VMs. This is the gate for the provider decision.
3. Implement certificate provider, durable site model, hostname validation and transactional HTTP/TLS reconcile with tests.
4. Complete default localhost installer provisioning, health checks, migration and repair.
5. Connect Projects, Virtual Hosts and HTTPS UI to the shared model; add project creation/connection flow.
6. Complete lifecycle/renewal/uninstall behavior and full VM/browser test matrix.
7. Update source docs and website claims only after release gates pass; capture clean localhost, project HTTPS, and installation examples.

## 10. Primary references checked

- mkcert behavior, supported names, CAROOT, server configuration responsibility and Windows/Firefox caveats: https://github.com/FiloSottile/mkcert
- Windows trust-store implementation (verify pinned version during prototype): https://github.com/FiloSottile/mkcert/blob/master/truststore_windows.go
- Reserved .test: https://datatracker.ietf.org/doc/rfc2606/
- .local multicast DNS: https://www.rfc-editor.org/info/rfc6762/
- Public .host delegation: https://www.iana.org/domains/root/db/host.html
- Firefox OS-root trust behavior and preference: https://support.mozilla.org/en-US/kb/automatically-trust-third-party-certificates

## 11. Installed-app manual review (supersedes source-only assumptions)

Inspected the running installed binary `C:\devstackbox\devstackbox.exe`, version 0.1.11, reviewed across October 17–18, 2026 (Asia/Calcutta). Navigated About, Projects, Services, Apache Overview, Virtual Hosts, the Add Virtual Host dialog, and HTTPS / SSL. Reviewed the application at its existing approximately 1200 x 830 window size in light theme. Opened and dismissed the add dialog without submitting. No trust, certificate, service, project, hosts-file, or security setting was changed. Source checkout findings and installed-build observations are separate evidence; matching version numbers do not prove identical binaries.

### Observed findings

| Screen / check | Actual observation | Required improvement |
| --- | --- | --- |
| Projects | One folder `a` at `C:\devstackbox\www\a`; Refresh only; card says to use Virtual Hosts; no site link or connection action | Make an unconnected project actionable with Connect site; then show URL and HTTPS health |
| Services | Apache and MySQL show Running; PHP 8.3.31 ready | Keep process health separate from site/TLS health |
| Apache Overview | Default-site action explicitly opens `http://localhost`; status reports only HTTP port 80 | Show HTTP and HTTPS separately; prefer verified HTTPS for Open Local Site and phpMyAdmin |
| Virtual Hosts | Only protected localhost system row; no configured virtual hosts | Show localhost health, not only System/Built-in badges; provide a useful project-selection empty state |
| Hosts inventory | `127.0.0.1 new.test` shown as DevStackBox-managed despite no configured virtual hosts | Detect orphan mapping; offer Reconnect or Remove mapping, with an exact affected-entry preview; do not silently delete it |
| Add Virtual Host | Only Domain and free-text Document Root; helper suggests .test or .local; missing folder is created | Default .test; add project/folder selection, document-root preview, HTTPS default, permissions explanation, and explicit existing-folder vs create-folder behavior |
| SSL top | Banner asks to trust certificate; three success checks say CA generated, leaf signed, SSL enabled | Use an overall Needs attention state while trust or live handshake fails; successful setup steps must not imply browser readiness |
| SSL lower | Separate Generate, Enable (Active), Disable cards plus repeated Trust action; 10-year leaf expiry | Replace with one health summary and context-sensitive repair; move low-level actions into Advanced |
| SSL details | Absolute user-profile paths take space in the primary status card | Put paths/fingerprints/issuer in expandable technical details, with safe copyable diagnostics |
| Browser HTTP | http://localhost renders the bundled PHP welcome page with PHP 8.3.31 and `C:/devstackbox/www` | Keep it as a diagnostic page, but show actual transport/security separately; current Ready wording only proves PHP execution |
| Browser HTTPS | Opening https://localhost in Chrome returned ERR_CERT_AUTHORITY_INVALID | Trust is a confirmed browser failure; inspect and repair served chain before claiming the whole TLS issue is resolved |
| phpMyAdmin | HTTP endpoint renders the login page; no authentication attempted | Validate its HTTPS entry point after repair, without requiring database login for the basic availability check |
| Orphan hostname browser test | Browser automation returned ERR_BLOCKED_BY_CLIENT for http://new.test | Inconclusive; do not attribute this to Apache or claim routing succeeded/failed |

Screenshots are local review evidence, not promotional assets: `review-artifacts/https/projects.png`, `vhosts.png`, `add-vhost.png`, and `ssl-status.png`. Some contain local paths and must not be copied to public website media without review.

### Limits of this inspection

This was a read-only manual UI audit, not a completed creation/renewal/installer test. The installed environment currently has no configured user vhosts, so populated rows and successful project provisioning were not exercised. A fresh installer, another Windows account, dark theme, language switching, failure injection and browser trust repair remain explicit test cases. The prior Windows HTTPS signature error and Chrome authority error both remain recorded; do not assume a single root cause resolves both without retesting.

## 12. Concrete screen-by-screen UX specification

### A. Projects list

Header: Projects, a count, search, and primary Add project. Add project offers Create empty project / Add existing folder. Search and filters become useful when there are many projects; an empty list has a short explanation and Add project button, not a large blank screen.

A discovered folder is labelled Not connected. Its primary action is Connect site. Show the project name and shortened folder with full path available on demand. For connected projects display the main URL, document root, Apache state and HTTPS state, with Open site as the primary action. Secondary actions: Open folder, Manage site, and an overflow menu for disconnecting the project. Do not remove files when disconnecting a site.

Example card, proposed:

```text
My shop                                Trusted HTTPS
https://my-shop.test                    Apache running
Folder: C:\devstackbox\www\my-shop
Document root: public/
[Open site]  [Open folder]  [Manage site]
```

For the currently observed folder `a`, Connect site should prefill `a.test` and the existing folder. It should not require typing that path again or moving the folder.

### B. Add / connect project dialog

Use one focused form with a visible summary, not a sequence of unrelated screens:

1. Choose existing project or browse/create a folder.
2. Name and suggested hostname (`my-shop.test`), editable with inline validation.
3. Document root with Browse and a framework-aware `public/` suggestion. Show exactly which directory Apache will serve.
4. HTTPS enabled by default; aliases collapsed under Advanced. Show CA health and explain a required Windows hosts permission before submission.
5. Summary: `https://my-shop.test` serves the selected root. Primary action Create site / Connect site. Cancel does not create folders, trust roots, hosts entries or certificates.

During setup show named steps: Validate → Map hostname → Issue certificate → Apply Apache configuration → Verify HTTPS. Disable duplicate submission. On failure show the failed step, what was restored, and Retry. On success show Open site; no additional Generate/Enable/Trust sequence.

### C. Virtual Hosts advanced view

Retain its current location under Services → Apache; it is the technical view of the same Sites used by Projects. Use a compact protected localhost section plus searchable project rows. Columns: Hostname, Project / Document root, Enabled, Name resolution, HTTPS, Actions. Each hostname links to the verified URL; a failed site offers Diagnose rather than a misleading successful-looking shortcut.

Actions: Edit, Enable/Disable, Verify, Renew certificate (advanced), Disconnect. Edit supports hostname/aliases and document root without deleting/recreating the site. Deleting/disabling updates both HTTP and HTTPS consistently. Present pending Apache changes clearly and apply them in one transaction; avoid asking users to remember a restart.

Replace the raw hosts block as the main troubleshooting experience with a “Hostname mappings” details panel. Flag the observed orphan `new.test` as “Mapping exists, site missing” with reconnect/remove options. Report external conflicts separately from DevStackBox-owned mappings. Preserve all unmanaged entries.

### D. HTTPS overview

Keep the user-facing title HTTPS; “SSL certificates” can remain in descriptive text/search. The top summary is one of Ready / Needs attention / Apache stopped / Checking. Show a short cause and one appropriate primary action: Set up HTTPS, Repair trust, Renew certificate, Resolve port conflict, or Start Apache.

Below it show localhost and each project with columns Hostname, Trust, Certificate expiry, Live verification, Action. Separate these checks: certificate exists; certificate matches hostname; issuer trusted for this account; Apache configured; live endpoint verified. Display last verified time, and invalidate successful status when configuration, trust, certificate or listener changes. On unknown/failed requests do not keep an old Ready badge.

Move Generate CA, certificate paths, fingerprints, issuer, SAN list, expiration, and global HTTPS disable into Advanced. A CA reset is a distinct consequential operation with affected-site explanation, not a routine Generate button. Disable HTTPS must explain which sites lose HTTPS, while keeping project files and database contents.

Use a single trust explanation/action, removing the duplicate top and bottom controls observed in the installed app. Explain that local trust is for this Windows account and computer, not public internet certification. Browser trust settings controlled by users or administrators must be respected.

### E. Apache, Dashboard, and local welcome page

Apache Overview shows Running/Stopped, HTTP address, HTTPS address and health, and concise links to Sites and HTTPS. The default Open Local Site chooses HTTPS only when verified. If intended HTTPS is broken, show Repair HTTPS and an explicit optional HTTP link rather than silently hiding the failure. phpMyAdmin uses the same URL-selection logic.

Dashboard should summarize “N projects / N HTTPS ready / N need attention”; selecting a project takes users to that project, not only to a generic management screen. Localhost remains protected, but its health is visible.

The bundled welcome page should state PHP working separately from HTTPS status and link to the appropriate local endpoints. Imported project content may contain HTTP assets or hardcoded base URLs; surface mixed-content diagnosis without pretending a certificate can rewrite the application safely.

### F. Installation and lifecycle UX

Installer setup summary includes trusted local HTTPS with a concise explanation. Provision for the original user, verify after service launch, and show the outcome explicitly at Finish. Normal successful installation needs no manual localhost SSL action. A trust-policy block or port conflict yields a specific incomplete step, not an unconditional success banner. Repair can resume inside the app without reinstalling.

On upgrade preserve projects, site IDs and the owned CA; migrate old one-certificate configuration only after staged validation. Renew leaves without interrupting unrelated projects. On uninstall provide precise choices for data preservation and removal of DevStackBox-owned trust/mappings. A user who preserves configuration should not be surprised by either lingering unexplained trust or an unexpectedly broken retained setup.

### G. Visual and accessibility consistency

Reuse the existing app typography, sidebar and Apache tabs. Reduce oversized technical cards and repeated headings. Keep one primary action per state, concise labels, neutral secondary actions, and a separate dangerous-action area. Status always includes text/icon, not color alone. Folder paths wrap or truncate without stretching tables.

Test at the 900 x 640 minimum window and a typical 1200 x 800 window; use responsive rows/details instead of clipped wide tables. Keep dialog actions visible, focus the first meaningful field, support Enter submission only when valid and Escape cancellation, preserve focus on return, label icon controls, and announce async errors/progress. Verify light/dark and English/Hindi after implementation; these are not claimed as inspected in this pass.

## 13. Implementation batches and approval checkpoints

The design recommendation remains mkcert + .test + per-site leaves. The manual review strengthens the need for a shared site workflow; changing certificate tools alone will not fix the UX or orphan-state problems.

Batch 1: establish reproducible installed-state diagnostics and fixture data for the observed missing trust, unconnected folder and orphan mapping. Record browser error codes and presented certificates. Validate the installer user-context prototype before committing to packaging details.

Batch 2: implement shared project/site state, atomic hosts/Apache/certificate orchestration, per-site status, migration and rollback. Tests must prove a second project does not change localhost's certificate or the first project's behavior.

Batch 3: implement Projects list and connection form, advanced Virtual Hosts view, and unified HTTPS health page. Review rendered screenshots and keyboard behavior against sections 12A–G.

Batch 4: integrate installer localhost provisioning, upgrade preservation, renewal and uninstall cleanup. Exercise clean VMs, alternate administrator credentials, offline mode and policy failures.

Batch 5: execute the full test matrix in section 8, capture warning-free localhost and two independent project sites in supported browsers, then update docs/website and prepare release assets.

Release acceptance: ordinary installation → start/open app → localhost works over trusted HTTPS; connect the existing `a` folder → `https://a.test` serves that folder; create a second site → both sites and localhost still work; rename/disable/remove → hosts, certificates, Apache and all UI views agree; every failure has an accurate status and recoverable next step.
