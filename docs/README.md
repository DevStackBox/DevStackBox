# DevStackBox - Documentation Index

**Start here.** This is the entry point for all project documentation.

---

## Core Docs (Read These First)

| Document                               | Purpose                                                         | When to Read                            |
| -------------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| [ROADMAP.md](ROADMAP.md)               | Phased plan: what to build and in what order                    | Before starting any work                |
| [ARCHITECTURE.md](ARCHITECTURE.md)     | How all parts connect, directory map, IPC flow, path resolution | Before writing any code                 |
| [FEATURE_STATUS.md](FEATURE_STATUS.md) | What is DONE, PARTIAL, STUB, or PLANNED                         | Before starting any feature work        |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md)     | All bugs, dead code, technical debt                             | Before building on top of existing code |

## Reference Docs

| Document                                     | Purpose                                                  | When to Read                     |
| -------------------------------------------- | -------------------------------------------------------- | -------------------------------- |
| [TAURI_COMMANDS.md](TAURI_COMMANDS.md)       | Every backend command: name, params, return type, status | Before calling any Tauri command |
| [COMPONENTS.md](COMPONENTS.md)               | Every React component: purpose, props, how to reuse      | Before creating a new component  |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | How to run, build, add features, coding rules            | New contributors and when stuck  |
| [NETWORKING.md](NETWORKING.md)               | Ports, conflicts, firewall, virtual hosts                | When services won't start        |
| [ERRORS.md](ERRORS.md)                       | Every error message with cause and fix                   | When something breaks            |

## Operations & Distribution

| Document                                               | Purpose                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| [RELEASE_PROCESS.md](RELEASE_PROCESS.md)               | Exact checklist for every release                               |
| [UPDATES_AND_MIGRATIONS.md](UPDATES_AND_MIGRATIONS.md) | Auto-update architecture, app/data separation, config migration |
| [TESTING.md](TESTING.md)                               | Manual and automated test strategy                              |
| [SECURITY.md](SECURITY.md)                             | Security policy, unsafe operations, vulnerability reporting     |
| [INSTALL.md](INSTALL.md)                               | End-user installation guide                                     |
| [APACHE_64BIT_GUIDE.md](APACHE_64BIT_GUIDE.md)         | Apache architecture troubleshooting                             |
| [MSI_TROUBLESHOOTING.md](MSI_TROUBLESHOOTING.md)       | Installer troubleshooting                                       |

## Architecture Decisions

| Document                                                         | Decision                                        |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| [adr/001-use-tauri.md](adr/001-use-tauri.md)                     | Why Tauri over Electron                         |
| [adr/002-use-tailwind-shadcn.md](adr/002-use-tailwind-shadcn.md) | Why Tailwind + shadcn/ui                        |
| [adr/003-no-redux.md](adr/003-no-redux.md)                       | Why no global state manager                     |
| [adr/004-polling-over-events.md](adr/004-polling-over-events.md) | Why polling for service status                  |
| [adr/005-php-first-scope.md](adr/005-php-first-scope.md)         | Why PHP-only for v1                             |
| [adr/006-app-data-separation.md](adr/006-app-data-separation.md) | Why separate app files from user data (updates) |

---

## The Single Source of Truth Rules

1. **What to build next** -> `docs/ROADMAP.md`
2. **Feature status** -> `docs/FEATURE_STATUS.md` (not README, not TODO.md, not CHANGELOG)
3. **Backend commands** -> `docs/TAURI_COMMANDS.md` (not scattered in component comments)
4. **Component inventory** -> `docs/COMPONENTS.md` (check here before creating a new one)
5. **Architecture** -> `docs/ARCHITECTURE.md` (understand this before writing Rust code)
6. **Bugs/debt** -> `docs/KNOWN_ISSUES.md` (fix critical issues before adding features)
7. **Auto-update/paths** -> `docs/UPDATES_AND_MIGRATIONS.md` (before touching paths or update logic)

**Reuse-first rule:** Before adding a new page, card, modal, status block, action row, or service helper, check `docs/COMPONENTS.md` and extend an existing component if the job is similar. Prefer shared props and composition over copy-pasting UI or logic.

---

## Before You Start Any Task

Answer these questions:

1. What should I work on next? -> Check [ROADMAP.md](ROADMAP.md) - work Phase 1 before Phase 2
2. Does the feature I need already exist? -> Check [FEATURE_STATUS.md](FEATURE_STATUS.md)
3. Does the component I need already exist? -> Check [COMPONENTS.md](COMPONENTS.md)
4. Does the Tauri command I need already exist? -> Check [TAURI_COMMANDS.md](TAURI_COMMANDS.md)
5. Am I building on broken code? -> Check [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
6. Where does my new file go? -> Check [ARCHITECTURE.md](ARCHITECTURE.md)
7. Can I extend an existing component or command wrapper instead of adding a parallel one? -> Check [COMPONENTS.md](COMPONENTS.md) and `src/lib/commands.ts`

---

## Project At a Glance

**DevStackBox** is a portable local PHP development environment (like XAMPP/Laragon) built with:

- Tauri 2 (Rust backend) + Vite + React 18 (TypeScript frontend)
- Tailwind CSS + shadcn/ui for all UI styling
- Framer Motion for animations
- i18next for English and Hindi translations

**Current state (v0.1.6):** MySQL and Apache controls work. The config editor works. Logs are basic and manually refreshed. PHP version selection is UI-complete but backend download/install is still incomplete. The system tray surface exists in the codebase but is not wired into the main app flow.

**Next milestone (v0.2.0):** Complete Phase 1 (stability) and Phase 2 (modularize backend). See [ROADMAP.md](ROADMAP.md).

## Documentation Audit Notes

- The current sidebar contains six items: Dashboard, Services, Projects, Logs, Settings, About.
- Only Dashboard, Services, Settings, and About are active today. Projects and Logs are placeholder surfaces.
- The command palette exists and opens with `Ctrl+P`, but there is no always-visible trigger in the current top bar.
- Shared frontend command names are defined in `src/lib/commands.ts`, not `src/lib/constants.ts`.

---

## Outdated Files (Do Not Update These)

| File                          | Superseded By                                |
| ----------------------------- | -------------------------------------------- |
| `MCP_ANALYSIS_AND_ROADMAP.md` | `docs/ROADMAP.md` + `docs/FEATURE_STATUS.md` |
| `TODO.md`                     | `docs/ROADMAP.md` + `docs/KNOWN_ISSUES.md`   |
