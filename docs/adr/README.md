# Architecture Decision Records (ADR)

This directory contains records of significant architectural decisions made in DevStackBox.

Each ADR explains:

- **What** was decided
- **Why** it was chosen over alternatives
- **What consequences** the decision has

---

## Index

| ADR                               | Title                                                | Status   |
| --------------------------------- | ---------------------------------------------------- | -------- |
| [001](001-use-tauri.md)           | Use Tauri (Rust) as the desktop framework            | Accepted |
| [002](002-use-tailwind-shadcn.md) | Use Tailwind CSS + shadcn/ui for styling             | Accepted |
| [003](003-no-redux.md)            | No global state manager                              | Accepted |
| [004](004-polling-over-events.md) | Use polling for service status (not event streaming) | Accepted |
| [005](005-php-first-scope.md)     | PHP-only scope for v1 (no Node, Python, etc.)        | Accepted |
| [006](006-app-data-separation.md) | Separate app files from user data directories        | Accepted |

---

## ADR Format

When adding a new ADR:

1. Create `docs/adr/NNN-short-title.md`
2. Add it to the index above
3. Use the status: Accepted / Deprecated / Superseded

Status "Superseded" means a newer ADR replaced this one - link to the replacement.
