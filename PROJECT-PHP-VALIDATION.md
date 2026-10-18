# DevStackBox 0.1.15 project PHP selection

## Included

- Projects and discovered folders display one item per row at all window sizes.
- Project rows show their pinned PHP version or the global-default setting.
- Project details lists only versions reported installed by PHP management, plus
  Use global default. Installing a version stays in the existing PHP Versions page.
- A project selection is persisted by stable project ID. Website edits preserve
  the selection. HTTP and HTTPS virtual hosts resolve the pinned executable directory
  directly, without changing the shared current junction or other projects.
- The backend rejects unsupported, missing/incomplete and invalid runtime installs.
  Applying uses the existing Apache validation/restart/rollback path.
- Pinning initially creates a per-version configuration at
  `config/php-runtimes/<version>/php.ini`, using that installed runtime's template,
  its extension directory, essential extensions, session directory and log path.
  Existing global php.ini customizations are not copied to pinned runtime configs.

## Validation

- 26 frontend tests passed, including hiding uninstalled versions, applying a
  project version without a global switch/download, and resetting to default.
- 29 Rust library tests passed; TypeScript and documentation checks passed.
- `cargo run --example project_php_smoke` passed in an isolated review profile:
  two concurrent virtual hosts served PHP 8.3 and 8.5 over both HTTP and HTTPS;
  loaded ini and extension directories matched the chosen branch; unsupported
  selection was rejected; selections persisted; changing the first site to 8.5
  changed its live response; resetting it restored 8.3 while the second stayed 8.5.
- Test PHP 8.5 was copied from the already downloaded installed runtime into the
  ignored development runtime folder. It is not added to the installer payload.
- Test TLS trust was confined to the HTTP client's certificate store. No Windows
  CA trust or hosts-file change was made. The test Apache process was stopped.
- Production frontend build succeeded with existing bundle/import warnings.

## Remaining scope

Project-aware terminals, per-version configuration/extension editing in the UI,
framework installers and the rest of the roadmap remain separate work. Terminals
currently use the global default; this release selects website PHP only. Native
visual review and installed upgrade testing remain pending. AI integration is excluded.

## Installer

- `src-tauri/target/release/bundle/nsis/DevStackBox_0.1.15_x64-setup.exe`
- Size: 187,084,846 bytes.
- SHA256: `4012b3f81b380fb71a2f870474454f5f951707f968fa3fa52a56a34cc70cad42`.
- Release build succeeded. Updater artifact and trusted-comment signatures verified
  against the configured public key. Adjacent `.sig` and `.sha256` files are present.
- Generated installer resources were checked: PHP 8.5 and test-profile runtime
  configurations are not bundled. Windows publisher signing remains unconfigured.
- No installation or public release was performed during this change.
