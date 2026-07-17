# Privacy Policy - DevStackBox

**DevStackBox is a local developer tool. Your data stays on your machine.**

---

## Summary

DevStackBox:

- Collects NO telemetry
- Sends NO usage data to any server
- Requires NO account or registration
- Has NO cloud dependency for normal operation
- Does NOT phone home

---

## What DevStackBox Does

DevStackBox runs entirely on your local machine. It:

- Starts and stops Apache, MySQL, and PHP processes on your computer
- Reads and writes config files on your computer
- Opens browser windows to `localhost` (your machine)
- Downloads PHP binaries from `windows.php.net` only when you explicitly request a download (Phase 3 feature, not yet available)

That is all.

---

## Network Access

DevStackBox makes network connections ONLY in these cases:

| When                          | To Where          | Why                                           |
| ----------------------------- | ----------------- | --------------------------------------------- |
| You click "Check for Updates" | `api.github.com`  | Fetch latest release info                     |
| You click "Download PHP X.Y"  | `windows.php.net` | Download PHP binary (Phase 3, not yet active) |
| Normal operation              | Nowhere           | No network needed                             |

There is no background network activity.

---

## Data Storage

All data DevStackBox creates is stored locally on your machine:

| Data            | Location                        |
| --------------- | ------------------------------- |
| Service configs | `config/` directory             |
| Config backups  | `config-backups/` directory     |
| Log files       | `logs/` directory               |
| App settings    | Windows AppData (Tauri default) |
| PHP binaries    | `php/` directory                |

No data is synced to any cloud service.

---

## Crash Reporting

DevStackBox does NOT automatically send crash reports. If the app crashes:

1. You see the error
2. You decide whether to report it
3. If you choose to report, you open a GitHub Issue manually
4. You control what information is shared

There is no automatic crash upload.

---

## Third-Party Software

DevStackBox bundles these open-source components:

| Component          | License                 | Source         |
| ------------------ | ----------------------- | -------------- |
| Apache HTTP Server | Apache License 2.0      | apache.org     |
| MySQL              | GPL / Oracle commercial | mysql.com      |
| PHP                | PHP License             | php.net        |
| phpMyAdmin         | GPL v2                  | phpmyadmin.net |

Each of these has its own privacy practices when you use them (for example, MySQL logs queries to disk). Those practices are outside DevStackBox's control.

---

## Children

DevStackBox is a developer tool intended for adults. It does not collect any personal information from anyone, including children.

---

## Changes to This Policy

If this policy changes, the updated version will be in this file in the GitHub repository. Changes take effect when committed to the main branch.

---

## Contact

Questions about privacy: hello@devstackbox.com
