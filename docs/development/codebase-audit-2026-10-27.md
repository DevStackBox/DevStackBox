# External codebase audit reconciliation - 2026-10-27

Reviewed all 30 findings against current source. This records which reports were defects, cleanup opportunities or intentional behavior. Changes remain unreleased; this audit does not claim an installed-app test of a new installer.

| Finding | Result and action |
| --- | --- |
| BUG-1 | Confirmed. Errors are red, warnings amber, notices blue. Classification also recognizes Apache module-prefixed levels such as `[core:alert]` and `[ssl:warn]`. |
| BUG-2 | Confirmed. Error fallback text now uses English/Hindi translations. The boundary also resets on navigation so returning to Dashboard can recover from a failed page. |
| BUG-3 | Confirmed unused prop. Removed `ServiceManager.onServiceToggle`; service actions remain owned by the provider. |
| BUG-4 | Confirmed misleading type/comment, not a working Git Bash feature. Removed the unsupported shell ID and claim; no unimplemented shell is advertised. |
| BUG-5 | Confirmed. Partial service availability has an amber badge and retains its text label. |
| BUG-6 | Confirmed. Log downloads include a sanitized title/service and UTC timestamp. |
| BUG-7 | Confirmed. Clipboard success and failure now produce translated feedback; rejected clipboard promises are handled. |
| GAP-1 | Confirmed usability gap. Unknown routes now show a translated not-found screen with a Dashboard action. Legacy redirects remain. |
| GAP-2 | Intentional session persistence, not a demonstrated defect. Keep the terminal mounted after its first visit so navigating away does not destroy terminal views/sessions. An Outlet refactor is not required for this fix. |
| GAP-3 | Partly confirmed. The reload icon already indicated work, but there was no explicit file-loading message and editing was possible during loading. Added loading/failure feedback and read-only protection until loading succeeds. |
| GAP-4 | Stale-URL claim does not exist: each call already asked the backend for the current URL. Removed the unused cache variable and invalidation API to make that behavior clear. |
| GAP-5 | Confirmed. Dashboard now displays refresh failures with Retry, retaining previously loaded entries rather than reporting a misleading empty state. |
| UX-1 / DUP-6 | Confirmed duplication. Dashboard and Services now use one `BulkServiceActions` component with consistent labels/spinners and availability rules. The provider retains the operation lock across navigation. |
| UX-2 | Maintainability improvement. Used icon exports are now configurable components rather than fixed element instances. |
| UX-3 | Rejected recommendation to use a presentation div. The backdrop is an interactive close control; a labeled button preserves keyboard and assistive-technology access. Its label is now translated. |
| UX-4 | Confirmed browser conflict. Desktop retains Ctrl+P; browser development mode uses Ctrl+Shift+P and leaves Print untouched. The user guide explains both. |
| DUP-1 / DEAD-7 | Consolidated the action contract into `types/services.ts`, including the actually used secondary variant and tooltip. ReactNode is a valid icon type, not inherently dead code. Removed the duplicate local interface/import. |
| DUP-2 | Confirmed. Removed unused service-specific status aliases. |
| DUP-3 | Confirmed maintenance debt. Moved six implementations into their workspace directories, removed forwarding files at the old implementation paths, and updated imports, tests and current documentation. Public routes remain unchanged. |
| DUP-4 | Intentional navigation contexts. Global Logs and service Logs reuse the same viewer without duplicate log logic. Redirecting would unexpectedly move users out of their selected workspace. |
| DUP-5 | Confirmed two startup call sites. Removed AppShell's redundant settings write; the service provider remains the startup owner and handles synchronization rejection. Settings changes still synchronize normally. |
| DEAD-1 | Removed unused `ServiceInfo`, `LogEntry` and `ConfigFile` frontend types. `ServiceAction` is now the shared type used by the component. Rust types are unchanged. |
| DEAD-2 | Confirmed. Removed unused app-name/description exports; package metadata remains canonical. |
| DEAD-3 / DEAD-4 | Confirmed unused Config/Logs/Backup/Copy icon exports and their imports removed. ExternalLink remains used by OpenIcon. |
| DEAD-5 | Confirmed. Removed unused JavaScript/Tauri scaffold SVG assets. |
| DEAD-6 | Already addressed by configuration: `/review-artifacts/` is ignored, no files there are tracked, and the installer uses an explicit resource allowlist that excludes it. Retained local diagnostic evidence and disposable database snapshots; no recursive deletion was needed. |
| DEAD-8 | Confirmed. Removed the unused ServiceStatus compatibility re-export from service-manager. |

## Validation

- 78 frontend tests passed across 14 files, including new regressions for real log-level formats, clipboard outcomes, bulk button availability, boundary recovery and configuration read failure.
- TypeScript checking passed after page moves and shared-type cleanup.
- Documentation validation passed: 40 MDX documents, 40 navigation slugs; coverage inventory contains 31 screens and 9 non-route flows.
- Existing database import fixes and their tests remain intact.
- Production Vite build passed; existing bundle-size and mixed-import warnings remain.
- Website content synchronized and all six website tests passed.
