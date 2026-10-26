# phpMyAdmin bundle slimming plan

Date: 2026-10-26. Status: first-pass packaging implemented and local NSIS upgrade verified; broader phpMyAdmin feature acceptance below remains a release checklist.

## Implementation result

The source tree remains intact. `scripts/stage-phpmyadmin.mjs` builds and verifies the generated installer payload using `packaging/phpmyadmin-policy.json`; Tauri now maps only that payload to phpmyadmin. The measured source has 4,244 files. Staging excludes 799 files (7.960 MiB) and adds one small theme-policy file, producing 3,446 files. Source maps, translations and offline documentation are retained. The full per-file report is generated at `packaging/phpmyadmin-report.json`.

The packaged theme policy also ignores obsolete theme cookies without altering authentication cookies. Existing installation configuration is backed up/restored during upgrades. Cleanup removes only excluded upstream files with matching hashes; modified/custom files and runtime caches remain untouched. Therefore an upgraded installation can retain edited legacy assets even though new installers ship one theme.

Refresh now requires a verified SHA-256, uses a unique extraction directory, validates the archive paths and expected release layout, preserves previous source, and rolls back if staging fails. Packaging regression checks run with `npm run test:packaging`.

The design below remains the reference for optional future reductions. No source files were deleted, and no release was published.

The local Windows upgrade completed successfully on 26 October. All 13 tracked configuration files were byte-identical immediately after installation, including phpMyAdmin configuration. The installed themes directory contains only `pmahomme`. Login-page rendering with obsolete theme cookies passed a local smoke check. This does not establish that every database editing, import/export, language or Designer workflow below has been retested. No installer speed improvement is claimed without a controlled comparison.

## Measured baseline

The local bundle identifies itself as phpMyAdmin 5.2.2. Inventory includes hidden files: **4,244 files, 54.043 MiB uncompressed**. This identifies the inspected version; it does not establish that it is the latest upstream release.

| Directory | Files | MiB |
| --- | ---: | ---: |
| vendor | 1,916 | 14.67 |
| locale | 44 | 13.77 |
| themes | 1,064 | 8.49 |
| js | 204 | 8.00 |
| libraries | 629 | 4.94 |
| doc | 78 | 2.30 |
| templates | 270 | 0.80 |

Installer download savings will differ from these figures because NSIS already uses solid compression. Fewer extracted files should reduce filesystem work, but the speed improvement must be measured on actual installations.

## Recommended removals from the installer payload

Keep **pmahomme**, the configured default and the hard-coded fallback in `libraries/classes/ThemeManager.php`.

| Candidate | Files | MiB | Conditions |
| --- | ---: | ---: | --- |
| themes/bootstrap/ | 276 | 1.194 | Remove this alternative theme only. |
| themes/metro/ | 297 | 4.991 | Remove this alternative theme only. |
| themes/original/ | 204 | 1.105 | Remove this alternative theme only. |
| setup/ | 9 | 0.40 | DevStackBox supplies configuration; browser setup is not needed. |
| examples/ | 4 | 0.01 | Examples are not required for normal operation. |
| tmp/ contents | 4 | 0.019 | These are generated Twig caches. Exclude at packaging time; never delete installed user data as part of this rule. |
| Root .rtlcssrc.json, babel.config.json, yarn.lock, package.json, CONTRIBUTING.md | 5 | about 0.24 | Build/contribution files; retain upstream source separately for maintenance. |

These non-overlapping exclusions total **799 files and 7.960 MiB**. The staged payload would have **3,445 files and about 46.08 MiB**: roughly 19% fewer files and 15% less uncompressed data.

Set `ThemeDefault = 'pmahomme'` and `ThemeManager = false` in the packaged configuration. Verify that stale cookies referencing removed themes fall back successfully. Preserve `themes/dot.gif`: templates and HTML generation reference it directly.

## Optional second pass

| Candidate | Additional savings after the first pass | Trade-off |
| --- | --- | --- |
| Remaining source maps (*.map) | 6 files, 2.306 MiB | Normal UI does not need source maps, but browser source debugging loses mappings. Check comments/network requests and do not remove adjacent JS/CSS. |
| doc/ | 78 files, 2.301 MiB | Removes offline help. The inspected documentation-link code falls back to the official website when local HTML is absent. Verify all help links before adopting. |
| locale/ | Up to 44 files, 13.77 MiB | Reduces language support. This is a product choice, not unused-file cleanup. |

First pass plus source-map removal totals **805 files and 10.266 MiB removed**, leaving **3,439 files and about 43.78 MiB**. Do not add map sizes from deleted theme directories twice.

Recommendation: implement the first pass, then verify source-map removal. Keep offline docs and all translations initially. If an English-only edition is wanted later, explicitly document it and test English fallback. The current locale directory has no Hindi translation; DevStackBox's own Hindi UI does not imply phpMyAdmin has one.

## Keep intact

- `vendor/`, including Composer autoload/installed metadata, runtime dependencies and dependency license files. File count alone is not evidence of redundancy.
- `libraries/`, `templates/`, `js/`, compiled theme CSS, images, fonts and theme metadata.
- `themes/pmahomme/` in full for the first pass, including SCSS. Its source is small; do not sacrifice source traceability for a marginal saving.
- `sql/`: configuration-storage creation/upgrade scripts support phpMyAdmin features.
- Entry points, `config.inc.php`, `show_config_errors.php`, `url.php`, `favicon.ico` and `robots.txt`.
- `LICENSE`, dependency notices, `README`, `ChangeLog`, release marker, Composer manifests and sample configuration. Preserve source/provenance needed for maintenance and redistribution.
- Writable upload/save/temp directories under the user's DevStackBox data profile. Existing native code migrates the default paths there; they are not installer cleanup targets.

Do not remove JavaScript just because a minified file exists beside it. Resolve actual runtime references first. Avoid generic recursive rules deleting everything named `src`, `test`, `docs`, `json` or `xml` inside dependencies.

## Packaging implementation

1. Add one versioned exclusion manifest and a staging script. Keep the upstream source directory intact; copy eligible files into an ignored packaging staging directory.
2. Generate a report listing every excluded path, reason, file count and bytes. Reject unsafe paths, unexpected links and output outside the staging root. Unknown upstream files stay included until reviewed.
3. Have the release build prepare this staging tree and pass a Tauri resource override mapping it to the installed `phpmyadmin` directory. Ensure the original `../phpmyadmin` mapping is replaced, not accidentally included alongside it. Use the same policy for every installer/resource packaging path.
4. Apply the one-theme configuration to the staged template and missing-config fallback consistently. Retain user database credentials, ports, custom settings and external data directories. Test upgrade handling separately; do not overwrite existing configs wholesale.
5. Improve `refresh-phpmyadmin-bundle.ps1`: use a unique temporary directory, verify the selected upstream archive, select its exact version directory, validate before replacement and preserve rollback until success. Its current shared temporary directory and first-directory selection are fragile. Rerun staging after every refresh so extras do not return to the installer.
6. Extend release verification beyond index.php/config presence: require fallback theme assets, autoload, templates, SQL files and license; reject forbidden files and nonempty bundled cache; verify exactly one theme directory.
7. Handle upgrades deliberately. Packaging exclusions stop new files from shipping but do not guarantee old installed themes disappear. Prefer narrowly scoped cleanup of known bundled obsolete assets with configuration preservation; never recursively delete custom themes, user dumps or unknown installation files. Test this against the actual NSIS upgrade behavior before implementation.
8. Update packaging documentation and the user guide to describe the single bundled theme. Keep the release version unchanged until a release is explicitly requested.

## Acceptance checks

- Fresh install and upgrade from the previous bundle, using disposable profiles.
- Login/logout, navigation and existing-theme-cookie fallback with the theme selector hidden.
- Database/table browsing, SQL editor, row editing and search.
- SQL and CSV import/export, compressed export, stored objects, users/privileges, Designer and configuration storage.
- All retained languages and RTL layout smoke checks; no missing theme assets or runtime errors.
- Help/license/changelog links; offline help if retained.
- Temp/cache regeneration and upload/save locations remain in the user data directory.
- Diff the original and staged trees: every removal matches the manifest; retained files are unchanged except explicitly generated configuration.
- Compare final installer size, installed bytes, file count and extraction time on the same machine/settings. Report measured values; do not promise a particular speedup from the uncompressed estimate.

## Upstream references

- [Theme configuration](https://docs.phpmyadmin.net/en/latest/config.html#theme-manager-settings): default theme and user-selectable theme controls.
- [Installation guidance](https://docs.phpmyadmin.net/en/latest/setup.html): upstream installation and update practices. Use documentation matching the pinned bundle version during implementation.

The first-pass implementation changes packaging and its single-theme configuration; the optional second pass is not enabled.
