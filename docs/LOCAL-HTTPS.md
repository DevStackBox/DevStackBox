# Local HTTPS and projects

DevStackBox 0.1.12 bundles mkcert 1.4.4 for Windows x64. The installer selects
local HTTPS setup by default and hands setup to the interactive desktop user.
Windows may ask that user to approve trusting the local certificate authority.
The app never bypasses that prompt or browser certificate verification.

After Apache starts, open **Services → Apache → HTTPS**. “Trusted HTTPS” means
a live request passed Windows trust validation, served the expected certificate,
and reached the intended virtual host. An existing certificate alone is not a
successful check. Managed browsers with separate trust policies may still need
administrator configuration; a specific green browser icon is not guaranteed.

The default certificate covers `localhost`, `127.0.0.1`, and `::1`. Each project
gets its own certificate, including its aliases. New project names use `.test`.
This is DevStackBox's local naming policy, not a restriction in mkcert. Existing
legacy entries remain readable without silently changing their HTTPS setting.

## Connect a project

1. Open Projects and choose **Add project / site**, or connect a discovered folder.
2. Browse to the project. Frameworks with `public/index.php` get a `public/`
   document-root suggestion. Review the actual folder before applying.
3. Choose a `.test` hostname, optional aliases, and HTTPS.
4. Apply. Windows may request permission to update its hosts file. DevStackBox
   checks Apache syntax and restarts its own Apache if it was running. Running
   HTTPS sites are verified before configuration changes are accepted.

Projects and Virtual Hosts display the same site records. Disconnecting a site
keeps project files. Creating an empty folder is an explicit, separate action;
cancelling the subsequent site form keeps that folder. Unconnected hosts entries
are displayed separately so users can reconnect or remove them deliberately.

## Repair and privacy

Use **Set up / repair HTTPS** to install trust, renew certificates, or repair a
damaged certificate/key pair. Advanced settings support a different HTTPS port
when 443 is occupied. A failed change attempts to restore the previous
configuration and running service. If recovery fails, its error is reported.
This is rollback for handled failures, not a crash-proof filesystem transaction.

CA keys live under the current user's `config/https/ca` directory, protected with
Windows ACLs. Never distribute those keys. Full backups exclude the old and new
certificate directories; restore does not import those private keys.

Uninstall keeps application data by default, including certificates. Before
permanently deleting an account's certificate directory, remove its trust from
that same Windows account. For a default installation, run in PowerShell:

```powershell
$env:CAROOT = Join-Path $env:LOCALAPPDATA 'devstackbox\config\https\ca'
$env:TRUST_STORES = 'system'
& 'C:\devstackbox\tools\mkcert\mkcert.exe' -uninstall
Remove-Item Env:CAROOT, Env:TRUST_STORES
```

Use the corresponding profile path if `DEVSTACKBOX_DATA_DIR` was overridden.
Removing trust affects every certificate issued by that particular local CA.
Automatic uninstall trust cleanup across multiple Windows accounts remains a
release qualification item; do not claim it is already covered by the installer.

## Validation scope

The Windows integration harness is `src-tauri/examples/https_smoke.rs`. It is
opt-in, requires a disposable `review-artifacts` profile and an already managed
`127.0.0.1 new.test` hosts mapping, and never adds or removes that mapping.
It exercises trusted localhost and project HTTPS, PHP, public roots with spaces,
phpMyAdmin isolation, duplicate/invalid names, editing, occupied-port rollback,
and damaged-key repair. It does not replace clean-machine installer testing.

Before a public release, qualify clean Windows installations, alternate admin
credentials, another standard-user account, offline WebView2 prerequisites,
Firefox/managed browser policy, and uninstall trust cleanup. The updater
signature is distinct from Windows Authenticode publisher signing.
