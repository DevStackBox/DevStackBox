# DevStackBox v0.1.6 (Tauri Edition)

A lightweight, portable, open-source local development environment for PHP developers.

**Author:** Nomad Programmer  
**Contact:** shiv@srapsware.com  
**Repository:** [ProgrammerNomad/DevStackBox](https://github.com/ProgrammerNomad/DevStackBox)  
**Latest Release:** [v0.1.6](https://github.com/ProgrammerNomad/DevStackBox/releases/latest)  
**Docs & Issues:** Please use [GitHub Issues](https://github.com/ProgrammerNomad/DevStackBox/issues) and [GitHub Wiki](https://github.com/ProgrammerNomad/DevStackBox/wiki) for all documentation, feature requests, and bug reports.

---

## 🎉 Recent Updates (v0.1.6)

### ✅ **What's New:**

- **✅ MSI Compatibility Fixed:** Clean semantic versioning (v0.1.6) for Windows MSI installer
- **✅ Complete UI Restoration:** Fixed accidentally deleted CSS and core files
- **✅ Both Installer Formats:** MSI (288.9 MB) and NSIS (147.7 MB) available
- **✅ GitHub Actions Fixed:** Resolved emoji encoding issues in CI/CD pipeline
- **✅ Project Structure Optimized:** Clean codebase following Vite + React + Tauri best practices

### 📦 **Download Now:**

- **Windows MSI Installer:** [DevStackBox_0.1.6_x64_en-US.msi](https://github.com/ProgrammerNomad/DevStackBox/releases/latest)
- **Windows NSIS Installer:** [DevStackBox_0.1.6_x64-setup.exe](https://github.com/ProgrammerNomad/DevStackBox/releases/latest)

---

## 🗂 Feature Summary Table

| Feature                                        | Status         | Description                                                                    |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| **MySQL Database**                             | ✅ Available   | Embedded MySQL server with GUI management                                      |
| **phpMyAdmin Integration**                     | ✅ Available   | Built-in database management interface                                         |
| **Modern UI (Vite+React+Tailwind+shadcn/ui)**  | ✅ Available   | Fast, responsive, utility-first design with animations                         |
| **Config Management (Backup/Restore)**         | ✅ Available   | Syntax-highlighting and backup/restore for config files                        |
| **Clean Semantic Versioning**                  | ✅ Available   | MSI/NSIS compatible version format (v0.1.6)                                    |
| **Multi-Format Installers**                    | ✅ Available   | Windows MSI (288.9 MB) and NSIS (147.7 MB) installers                          |
| **Multilanguage UI**                           | ✅ Available   | i18next-based internationalization with English and Hindi support              |
| **Crash & Bug Reporting via GitHub**           | 🔄 In Progress | User-initiated crash/bug reports with pre-filled GitHub Issues                 |
| **Logs Viewer**                                | 🔄 In Progress | View MySQL, phpMyAdmin, Apache, PHP, and app logs with real-time search/filter |
| **System Tray Integration**                    | 🔄 In Progress | Minimize to tray, quick actions                                                |
| **Auto-Update Support**                        | 🔄 In Progress | Tauri auto-updates via GitHub Releases                                         |
| **Apache HTTP Server**                         | 🕓 Planned     | Portable Apache, vhost & HTTPS management                                      |
| **Multiple PHP Versions**                      | 🕓 Planned     | Default PHP 8.2, others downloadable via in-app installer                      |
| **One-Click App Installers**                   | 🕓 Planned     | Install WordPress, Laravel, more with simple UI                                |
| **PHP Extensions Management**                  | 🕓 Planned     | Enable/disable extensions per PHP version                                      |
| **Security Analyzer**                          | 🕓 Planned     | Scan PHP configs/code for security issues                                      |
| **Mail Testing Tools**                         | 🕓 Planned     | Built-in Mailhog or similar for email capture                                  |
| **Portable Mode / Zero Installation**          | 🕓 Planned     | All data/settings/logs in app folder                                           |
| **Database Backup/Restore (One-Click)**        | 🕓 Planned     | UI to export/import MySQL databases                                            |
| **MySQL User Management**                      | 🕓 Planned     | Create/edit MySQL users/privileges via UI                                      |
| **Quick Launch Tools**                         | 🕓 Planned     | Terminal (PHP/MySQL CLI), copy connection string, etc.                         |
| **Full App/Data Backup/Restore**               | 🕓 Planned     | Backup configs, databases, logs in one click                                   |
| **Automatic Virtual Host Management**          | 🕓 Planned     | Pretty URLs like `myapp.test`                                                  |
| **HTTPS/SSL for Local Sites**                  | 🕓 Planned     | One-click SSL for local domains and phpMyAdmin                                 |
| **Multilanguage UI**                           | ✅ Available   | i18next-based internationalization with English and Hindi support              |
| **Project Templates/Cloning**                  | 🕓 Planned     | Clone from Git or use templates for new projects                               |
| **Composer Integration**                       | 🕓 Planned     | Global/per-project Composer support                                            |
| **PHP INI & Apache Config Editors**            | 🕓 Planned     | User-friendly config editing                                                   |
| **PHP Error Display Toggle**                   | 🕓 Planned     | Enable/disable display_errors from UI                                          |
| **Service Status & Tray Notifications**        | 🕓 Planned     | Tray notifications for service events                                          |
| **Portable PHP CLI**                           | 🕓 Planned     | Terminal with PHP version selector                                             |
| **Bundled Tools (curl, git, node, npm, etc.)** | 🕓 Planned     | Optionally bundle common CLI tools                                             |
| **Log Viewer Enhancements**                    | 🕓 Planned     | Real-time, filterable, tabbed log viewer for all services/apps                 |
| **Project Full Backup/Restore**                | 🕓 Planned     | Backup/restore www files, configs, databases                                   |

**Legend:**  
✅ Available  🔄 In Progress  🕓 Planned

---

## 🚀 What is DevStackBox?

DevStackBox is a next-generation, portable PHP development stack built using Tauri, Vite, React, Tailwind CSS, shadcn/ui, and Framer Motion.  
It provides a **fast, modern, cross-platform GUI** for managing your entire PHP stack locally — all with minimal dependencies and a beautiful UI.

- **Super lightweight:** Tauri core is 5–30MB (excluding service binaries)
- **Cross-platform:** Windows 10/11, macOS, Linux
- **Dark/Light Mode:** Fully supported everywhere
- **Auto-update:** Releases and updates are managed via GitHub Releases and Tauri’s updater
- **Community-first:** All features, bugs, and documentation are handled on GitHub

---

## 📋 Prerequisites

- Windows 10/11, macOS, or Linux
- [Node.js 18+](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri backend)
- [Git](https://git-scm.com/)
- [pnpm](https://pnpm.io/) or [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites/)

---

## 🛠 Installation & Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/ProgrammerNomad/DevStackBox.git
   cd DevStackBox
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Tauri CLI is already included via project dependencies:**

   ```bash
   npm run tauri -- --version
   # or
   pnpm tauri --version
   ```

4. **Run the application:**
   ```bash
   pnpm tauri dev
   # or
   npm run tauri:dev
   ```

---

## 🏗 Project Structure

```plaintext
DevStackBox/
├── src-tauri/         # Tauri (Rust) backend for process mgmt, IPC, native ops
├── src/               # Frontend (Vite + React + Tailwind + shadcn/ui + Framer Motion)
├── mysql/             # Portable MySQL setup
├── php/               # PHP 8.2 binaries (default)
├── apache/            # Apache portable setup (planned)
├── phpmyadmin/        # phpMyAdmin setup
├── apps/              # One-click app installers (planned)
├── config/            # Config files (php.ini, my.cnf, httpd.conf, etc.)
├── config-backups/    # Config backup files
├── logs/              # Log files (Apache, MySQL, PHP, etc.)
├── www/               # Web root directory (planned)
├── locales/           # Translation files (EN, HI, etc.)
└── package.json       # Project config (frontend)
```

---

## 🖥️ Menus & UI Navigation

- **Sidebar Navigation**: Main sections (Dashboard, Projects, Services, Logs, Settings, About)
- **Top Bar**: Quick actions (theme switcher, language, user menu, updates)
- **Command Palette**: Fast action search/jump (Ctrl+P or Cmd+P, shadcn/ui’s Command component)
- **Context Menus**: Right-click per-item actions (shadcn/ui ContextMenu)
- **Tabs**: For sub-navigation within a page (e.g., “Overview | Logs” for a service)

---

## 🖥️ Portable CLI Terminal

- **Integrated Terminal**: Embedded xterm.js terminal using Tauri’s process management
- **PHP Version Selector**: (Planned) Change PHP version per session (other versions downloadable)
- **Composer & MySQL CLI**: Available in the app terminal
- **Bundled Tools**: Optionally ship with curl, git, node, npm, etc.

---

## 🔄 Auto-Update Support

- **Distribution:** Releases and auto-updates are managed via [GitHub Releases](https://github.com/ProgrammerNomad/DevStackBox/releases).
- **Update:** App will auto-update itself from GitHub (using Tauri's built-in updater).

---

## 🗃️ Backup & Restore

- **Config Backup/Restore:** Automatic and manual backups for all configs
- **Database Backup/Restore:** One-click export/import for MySQL databases
- **Full App Backup/Restore:** Backup/restore all critical files and databases

---

## 🗂 Log Viewer

- Real-time, searchable log viewer for MySQL, Apache, PHP, phpMyAdmin, and app logs

---

## 🛡️ Security

- **User-initiated bug/crash reporting:** Pre-filled GitHub issues from the app
- **Security analyzer:** (Planned) Scan configs and code for common issues
- **HTTPS/SSL:** One-click SSL for local projects (planned)
- **MySQL user management:** GUI for users/privileges

---

## 🎨 UI Design

- **No Custom CSS Required:** Use Tailwind utility classes and shadcn/ui only (document rare exceptions)
- **Consistent Design Language:** Unified styling across all components
- **Mobile-First Responsiveness:** Adapts to any screen size
- **Dark/Light Mode:** Easy theming (shadcn/ui + Tailwind)
- **Animation:** Smooth transitions via Framer Motion

---

## 🌐 Multilanguage

- All user-facing text must use i18next (EN, HI)
- Language switcher styled with icons and Unicode support
- Proper font handling for Devanagari/Hindi

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License – see [LICENSE](LICENSE)

---

## 🙏 Acknowledgments

- Inspired by Laragon, XAMPP, and the open-source community
- Built with [Tauri](https://tauri.app/), [Vite](https://vitejs.dev/), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), and [Framer Motion](https://www.framer.com/motion/)

---

## 📞 Support

- 🐛 Report bugs: [GitHub Issues](https://github.com/ProgrammerNomad/DevStackBox/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/ProgrammerNomad/DevStackBox/discussions)
- 📧 Email: [shiv@srapsware.com](mailto:shiv@srapsware.com)

---

**DevStackBox** – Making local PHP & MySQL development simple, modern, and portable! 🚀
