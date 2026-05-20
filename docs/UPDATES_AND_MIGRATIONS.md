# DevStackBox - Updates and Migrations

**The single source of truth for auto-update architecture, data safety, and config migration strategy.**

Read this before implementing or modifying anything related to installation paths, auto-updates, config file handling, or the folder structure.

---

## The Core Rule

> Auto-update must NEVER destroy user data.

This rule governs every architectural decision in this document.

---

## App/Data Directory Separation

The most important structural requirement for reliable auto-updates is separating replaceable app files from irreplaceable user data.

### App Root (safe to replace during updates)

```
C:\Program Files\DevStackBox\
  DevStackBox.exe
  apache/              <- Apache HTTP Server binaries
  php/                 <- PHP binaries (all versions)
  phpmyadmin/          <- phpMyAdmin PHP files
  resources/           <- Bundled assets
  updater files
```

Everything here can be overwritten by the updater without any data loss.

### User Data Root (NEVER touched during updates)

```
C:\dsb-data\
  www/                 <- User's PHP projects / web root
  mysql-data/          <- MySQL database files (InnoDB data, indexes)
  logs/                <- Apache, MySQL, PHP error logs
  config/              <- Runtime configs (php.ini, httpd.conf, my.cnf)
  config-backups/      <- Automatic config backups
  certs/               <- SSL certificates
  backups/             <- Full database / project backups
```

The updater must never write to this directory. The user chooses this path during first-run setup.

### Why This Matters

If MySQL's `data/` folder lives inside the app installation directory:

- An update that replaces the app folder **destroys all databases**
- The user loses all their data permanently
- There is no recovery without a backup

This is not theoretical. It has happened to real users of tools like XAMPP and WAMP.

---

## Current State (v0.1.6)

**This separation does not exist yet.** Everything is currently in one directory:

```
c:\xampp\htdocs\DevStackBox\  (or wherever installed)
  apache/
  mysql/        <- binaries AND data/ mixed together
  php/
  config/
  logs/
  www/
```

Fixing this is tracked in ROADMAP.md Phase 1.8. Do not enable auto-updates until Phase 1.8 is complete.

---

## Installed vs Portable Mode

### Decision: Installed Mode Only (for v1)

DevStackBox v1 supports **installed mode only**. Portable mode is explicitly deferred.

**Why:**

- Auto-updates require a stable, known install path
- Portable mode puts app files and user data in the same folder by design
- Combining both modes doubles the complexity of every path-related decision
- MSI installer already implies an installed model

**Portable mode (future):**

Portable mode will be supported in a future version with a deliberate design:

- No auto-updates in portable mode (manual download only)
- All data stored relative to the portable folder
- Clearly documented as "no auto-update" in the UI

This decision is recorded in `docs/adr/006-app-data-separation.md`.

---

## Auto-Update Flow

When the auto-updater is active (Phase 4.3+), updates must follow this exact flow:

```
1. Check GitHub Releases for new version
       |
2. Prompt user: "v0.1.7 available — Update Now / Later"
       |
3. User confirms update
       |
4. STOP all running services (Apache, MySQL)
   - Flush MySQL logs
   - Wait for clean shutdown (or timeout + kill after 10s)
       |
5. Backup current user configs to config-backups/
       |
6. Download new installer/package via Tauri updater
       |
7. Replace App Root files ONLY
   (never touch User Data Root)
       |
8. Run config migration if configVersion changed
       |
9. Restart app
       |
10. Restart previously running services
```

### Critical: Never Update While Services Are Running

Updating while Apache or MySQL is running risks:

- Locked DLL files blocking the update (Windows)
- Corrupted MySQL InnoDB data if mysqld is killed mid-write
- Partial Apache module replacement

The update flow MUST stop services before replacing any binaries.

---

## Config Versioning

Every config file written by DevStackBox must include a version field.

### Format

```json
{
  "configVersion": 1,
  "phpVersion": "8.2",
  "mysqlPort": 3306
}
```

### Migration Rules

- When the app starts, read `configVersion` from the config
- If `configVersion < current`, run the migration chain
- Each migration function transforms one version to the next
- Always back up the config before migrating
- Log migration actions to the app log

### Example Migration Chain

```rust
fn migrate_config(config: Value, from_version: u32) -> Result<Value, String> {
    let mut config = config;
    let mut v = from_version;

    if v == 1 {
        // v1 -> v2: add apachePort field with default 80
        config["apachePort"] = json!(80);
        v = 2;
    }
    if v == 2 {
        // v2 -> v3: rename mysqlPort to dbPort
        config["dbPort"] = config["mysqlPort"].clone();
        config.as_object_mut().unwrap().remove("mysqlPort");
        v = 3;
    }
    Ok(config)
}
```

---

## What the Updater Replaces vs Keeps

| Path                       | On Update     | Notes                                    |
| -------------------------- | ------------- | ---------------------------------------- |
| `DevStackBox.exe`          | REPLACED      | Main app binary                          |
| `apache/bin/`              | REPLACED      | Apache binaries                          |
| `php/{version}/`           | REPLACED      | PHP binaries per version                 |
| `phpmyadmin/`              | REPLACED      | phpMyAdmin files                         |
| `resources/`               | REPLACED      | Bundled UI assets                        |
| `dsb-data/www/`            | NEVER TOUCHED | User's web projects                      |
| `dsb-data/mysql-data/`     | NEVER TOUCHED | Database files                           |
| `dsb-data/config/`         | NEVER TOUCHED | Runtime configs (migrated, not replaced) |
| `dsb-data/logs/`           | NEVER TOUCHED | Log files                                |
| `dsb-data/config-backups/` | NEVER TOUCHED | Backup files                             |

---

## Recovery Mode (Safe Mode)

If an update breaks the app, a minimal recovery UI should be available.  
This is planned for a future phase. When implemented, recovery mode should offer:

- Reset configs to defaults
- Restore config from backup
- Rollback to previous app version (if supported)
- Open log files in Notepad
- Start/stop services manually

Recovery mode must be reachable even if the main UI fails to load.

---

## Before Enabling Auto-Updates: Checklist

Do not enable the auto-updater until ALL of these are done:

- [ ] App/data directory separation is implemented (Phase 1.8)
- [ ] `get_installation_path()` returns deterministic, stable paths
- [ ] MySQL `data/` directory is in the User Data Root, not the App Root
- [ ] Pre-update service shutdown is implemented
- [ ] Config versioning is in place
- [ ] Backup-before-update is implemented
- [ ] The update flow is manually tested: old version -> new version
- [ ] Tauri updater signing key is generated and stored in GitHub Secrets
- [ ] GitHub Release JSON endpoint is configured in `tauri.conf.json`

See ROADMAP.md Phase 4.3 for the implementation tasks.

---

## Semantic Versioning Discipline

Version numbers must be clean semver: `X.Y.Z` only.

- Never use: `0.1.7-beta`, `0.2.0-rc1`, `1.0.0-alpha.3`
- Always use: `0.1.7`, `0.2.0`, `1.0.0`

Reason: MSI bundler rejects versions with hyphens or letters. This has caused failed builds before.

Version must be identical in all three files simultaneously:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

---

## Update UI

Keep the update UI minimal:

```
┌─────────────────────────────────────────┐
│  Update Available                       │
│                                         │
│  v0.1.7 → v0.1.8                       │
│                                         │
│  • Improved Apache startup              │
│  • Fixed tray minimize                  │
│  • PHP 8.4 support                      │
│                                         │
│  [ Update Now ]     [ Later ]           │
└─────────────────────────────────────────┘
```

Do NOT build: a release center, progress analytics, or a large updater dashboard.  
One dialog, two buttons. That is all.
