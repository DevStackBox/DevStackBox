# ADR 001 - Use Tauri (Rust) as the Desktop Framework

**Status:** Accepted  
**Date:** 2024

---

## Decision

Use Tauri with a Rust backend as the desktop application framework.

---

## Context

DevStackBox needs to:

- Start and stop system processes (Apache, MySQL, PHP)
- Read and write config files
- Detect running processes
- Bundle native Windows binaries
- Produce an MSI installer for Windows

Several options exist for building cross-platform desktop apps.

---

## Options Considered

| Option           | Pros                                                   | Cons                                 |
| ---------------- | ------------------------------------------------------ | ------------------------------------ |
| **Tauri (Rust)** | Tiny binary, native OS access, Rust safety, WebView UI | Requires Rust knowledge              |
| Electron         | Large ecosystem, easy JS                               | 60-200MB runtime, high memory usage  |
| NW.js            | Similar to Electron                                    | Even larger, less active             |
| Qt (C++)         | Native UI, fast                                        | Complex, C++ required, no web stack  |
| Pure Rust (egui) | Fully native                                           | No web ecosystem, limited UI toolkit |

---

## Decision Rationale

Tauri was chosen because:

1. **Installer size**: Tauri core is 5-30MB. Electron is 60-200MB minimum. For a PHP stack where Apache+MySQL+PHP are already 200MB+, the framework overhead matters.
2. **Native OS access**: Rust has first-class access to `std::process::Command`, filesystem, networking - everything needed to manage services.
3. **Web frontend**: Developers can use React, Tailwind, shadcn/ui - the modern JS ecosystem - for the UI while keeping the heavy lifting in Rust.
4. **Memory safety**: Rust prevents whole classes of bugs common in native apps (buffer overflows, use-after-free, etc.).
5. **Tauri 2 plugin ecosystem**: Plugins for updater, tray, HTTP client, process management already exist.

---

## Consequences

- All Tauri commands must be defined in Rust (`src-tauri/src/`)
- Frontend cannot run arbitrary native code - must use `invoke()` to cross the IPC boundary
- All IPC calls are async - frontend must handle loading states
- Rust knowledge is required for any backend changes
- Cross-platform builds require different CI environments (Windows for MSI, macOS for dmg)
