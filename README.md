# DevStackBox

A lightweight, portable, open-source local development environment for PHP developers on Windows.

**Author:** Nomad Programmer  
**Contact:** shiv@srapsware.com  
**Repository:** [ProgrammerNomad/DevStackBox](https://github.com/ProgrammerNomad/DevStackBox)  
**Latest release:** [v0.1.7](https://github.com/ProgrammerNomad/DevStackBox/releases/latest)

---

## What is DevStackBox?

DevStackBox bundles Apache, PHP, MySQL, and phpMyAdmin in a single desktop application with a modern UI for starting services, editing configuration, and managing local websites.

Install location: `C:\devstackbox`  
Application data: `%LOCALAPPDATA%\devstackbox`

---

## Features

| Feature | Status |
|---------|--------|
| Apache, MySQL, PHP, phpMyAdmin | Working |
| Config editor and backup/restore | Working |
| English and Hindi UI | Working |
| Dark and light mode | Working |
| NSIS installer | Working |
| System tray | Partial |
| Log viewer | Partial |
| Multiple PHP versions | Partial |
| Auto-updater | In progress |

Full status: [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md)  
Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)  
Release history: [CHANGELOG.md](CHANGELOG.md)

---

## Installation

Download the Windows installer from [GitHub Releases](https://github.com/ProgrammerNomad/DevStackBox/releases/latest):

- `DevStackBox_0.1.7_x64-setup.exe` (NSIS)

End-user guide: [docs/INSTALL.md](docs/INSTALL.md)

---

## Development

**Prerequisites:** Windows 10/11, Node.js 18+, Rust, Git, pnpm

```bash
git clone https://github.com/ProgrammerNomad/DevStackBox.git
cd DevStackBox
pnpm install
pnpm tauri dev
```

See [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) for full setup.

---

## Documentation

All documentation: [docs/README.md](docs/README.md)  
Writing standards: [docs/standards/WRITING_GUIDELINES.md](docs/standards/WRITING_GUIDELINES.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Privacy

No telemetry. No internet required for normal use. See [PRIVACY.md](PRIVACY.md).

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Support

- [GitHub Issues](https://github.com/ProgrammerNomad/DevStackBox/issues)
- [GitHub Discussions](https://github.com/ProgrammerNomad/DevStackBox/discussions)
- [shiv@srapsware.com](mailto:shiv@srapsware.com)
