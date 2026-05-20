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

## 🗂 Feature Summary

| Feature                                     | Status                                      |
| ------------------------------------------- | ------------------------------------------- |
| MySQL start/stop + phpMyAdmin               | Working                                     |
| Apache start/stop                           | Working                                     |
| Config editor (php.ini, httpd.conf, my.cnf) | Working                                     |
| Config backup/restore                       | Working                                     |
| English + Hindi UI                          | Working                                     |
| Dark/light mode                             | Working                                     |
| MSI + NSIS installers                       | Working                                     |
| System tray                                 | Partial                                     |
| Log viewer                                  | Partial (no real-time)                      |
| Multiple PHP versions                       | Partial (switching works, download is stub) |
| Auto-updater                                | Not functional yet                          |

Full feature status and roadmap: [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) and [docs/ROADMAP.md](docs/ROADMAP.md)

---

## What is DevStackBox?

DevStackBox is a modern, portable PHP development stack for Windows, built with Tauri, React, Tailwind CSS, and shadcn/ui.

- **Lightweight:** Tauri core is 5-30MB (not Electron)
- **Modern UI:** Dark/light mode, animations, responsive
- **PHP-focused:** Apache + PHP + MySQL + phpMyAdmin
- **Open source:** MIT license, community-driven

---

## Prerequisites

- Windows 10/11
- [Node.js 18+](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Git](https://git-scm.com/)
- [pnpm](https://pnpm.io/) or npm

## Getting Started

```bash
git clone https://github.com/ProgrammerNomad/DevStackBox.git
cd DevStackBox
pnpm install
pnpm tauri dev
```

See [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) for full setup instructions.

---

## Documentation

All project documentation is in the [docs/](docs/) directory.

Start with [docs/README.md](docs/README.md) for a complete index.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

1. Fork the repository
2. Branch: `git checkout -b feature/your-feature`
3. Commit and push
4. Open a Pull Request

---

## Privacy

DevStackBox collects no telemetry and requires no internet connection for normal use. See [PRIVACY.md](PRIVACY.md).

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Support

- Report bugs: [GitHub Issues](https://github.com/ProgrammerNomad/DevStackBox/issues)
- Discussions: [GitHub Discussions](https://github.com/ProgrammerNomad/DevStackBox/discussions)
- Email: [shiv@srapsware.com](mailto:shiv@srapsware.com)
