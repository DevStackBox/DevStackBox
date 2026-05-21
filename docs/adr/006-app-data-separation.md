# ADR 006: App/Data Directory Separation

**Status:** Accepted  
**Date:** May 2026  
**Deciders:** Project maintainer

---

## Context

DevStackBox bundles Apache, PHP, MySQL, and phpMyAdmin binaries alongside user data (web projects, databases, configs, logs) in a single directory. This was acceptable for early development but creates a critical problem when auto-updates are introduced.

If the updater replaces files in the installation directory, it risks overwriting:

- MySQL `data/` - destroying all user databases permanently
- Runtime config files - resetting all user customizations
- User web projects in `www/` - destroying active project files

This has caused catastrophic data loss in similar tools (early WAMP, older MAMP versions, some XAMPP configurations).

---

## Decision

Separate all application files from all user data files into two distinct directory roots with different replacement policies.

**App Root** (replaceable by updater):

```
C:\Program Files\DevStackBox\
  DevStackBox.exe
  apache/
  php/
  phpmyadmin/
  resources/
```

**User Data Root** (never touched by updater):

```
C:\dsb-data\
  www/
  mysql-data/
  logs/
  config/
  config-backups/
  certs/
  backups/
```

The user data path (`C:\dsb-data\` by default) is configurable at first run and stored in the app's settings.

---

## Alternatives Considered

### 1. Keep everything in one directory, use file exclusion in the updater

**Rejected.** Exclusion lists are fragile. Any new file added to the app that happens to overlap with a user data path could be excluded from updates incorrectly. The Tauri updater does not natively support granular exclusion lists.

### 2. Store user data in `%APPDATA%\DevStackBox\`

**Partially accepted.** `%APPDATA%` is the correct Windows convention for user-specific app data. However, `C:\dsb-data\` is preferred for user-facing directories (`www/`, `mysql-data/`) because:

- Users need to easily locate and access their web projects
- `C:\dsb-data\www\` is easier to explain to beginners than `C:\Users\name\AppData\Roaming\DevStackBox\www\`
- Consistent with how tools like XAMPP expose `C:\xampp\htdocs\`

**Implementation note:** App settings and non-user-facing data (certs, internal logs) can use `%APPDATA%\DevStackBox\`. The `www/` and `mysql-data/` directories use `C:\dsb-data\`.

### 3. Portable mode with everything in one folder, no updates

**Deferred.** Portable mode is a valid use case but explicitly conflicts with auto-updates. Attempting to support both in v1 doubles the complexity of every path decision. Portable mode is deferred to a future version where it will be clearly marked as "no auto-updates."

---

## Consequences

### Positive

- Auto-updates become safe: replacing App Root never touches user data
- Clear mental model for users: "my projects are in `C:\dsb-data\www\`"
- MySQL database files are protected from update accidents
- Allows future features like "open data folder" button in the UI

### Negative

- Requires implementing `get_user_data_path()` alongside `get_installation_path()` in Rust
- Migration work needed: existing installations have the mixed layout
- First-run setup must ask for or confirm the user data path
- Config file paths in `httpd.conf` and `my.cnf` must point to the User Data Root, not the App Root

### Migration Path for Existing Installations

When a user with v0.1.x (mixed layout) updates to v0.2.0 (separated layout):

1. App detects no User Data Root exists at first launch
2. Prompts user to confirm `C:\dsb-data\` as data directory (or choose custom)
3. Migrates existing `www/`, `mysql/data/`, `logs/`, `config/` to the new location
4. Updates config file paths to point to new locations
5. Backs up original directory before migrating

---

## Implementation Reference

See `docs/UPDATES_AND_MIGRATIONS.md` for the complete update flow, config versioning strategy, and the pre-update checklist.

Tracked in ROADMAP.md as Phase 1.8.
