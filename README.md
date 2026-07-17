# DevStackBox

[![Release](https://img.shields.io/github/v/release/DevStackBox/DevStackBox?style=flat-square)](https://github.com/DevStackBox/DevStackBox/releases/latest)
[![License: MIT](https://img.shields.io/github/license/DevStackBox/DevStackBox?style=flat-square)](LICENSE)
[![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white)](https://github.com/DevStackBox/DevStackBox/releases)

Local PHP development for Windows - Apache, MySQL, PHP, and phpMyAdmin in one desktop app.

DevStackBox is free and open source. It gives you a modern interface to start services, edit configs, manage sites, handle SSL, and run backups. One installer, fixed paths, no telemetry.

## Why DevStackBox?

- **All-in-one** - Apache, PHP, MySQL, and phpMyAdmin in a single setup
- **Modern UI** - Desktop app built with Tauri and React, not a tray of loose tools
- **Fixed layout** - Installs to `C:\devstackbox`; app data in `%LOCALAPPDATA%\devstackbox`
- **Useful extras** - Config editor, SSL, backup/restore, dark/light themes, English and Hindi
- **Your machine stays yours** - No telemetry; offline-friendly for everyday development
- **Open source** - MIT license

If you use XAMPP, Laragon, or WAMP today, DevStackBox targets the same stack with less manual wiring.

## Quick start

1. Download the latest installer from [GitHub Releases](https://github.com/DevStackBox/DevStackBox/releases/latest).
2. Run setup (administrator rights required).
3. Open DevStackBox and start Apache, MySQL, and PHP when you need them.

Full guide: [docs/INSTALL.md](docs/INSTALL.md)

## Build from source

```bash
git clone https://github.com/DevStackBox/DevStackBox.git
cd DevStackBox
pnpm install
pnpm tauri dev
```

You need Windows 10 or 11, Node.js 18+, Rust, pnpm, and Git. See [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md).

## Documentation

| Guide                                    | Description           |
| ---------------------------------------- | --------------------- |
| [Installation](docs/INSTALL.md)          | Install and first run |
| [Development](docs/DEVELOPMENT_GUIDE.md) | Local build setup     |
| [Feature status](docs/FEATURE_STATUS.md) | Shipped vs planned    |
| [Roadmap](docs/ROADMAP.md)               | What is next          |
| [Changelog](CHANGELOG.md)                | Release history       |
| [Docs index](docs/README.md)             | Everything else       |

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening a pull request.

## Links

- Website: [devstackbox.com](https://devstackbox.com)
- Email: [hello@devstackbox.com](mailto:hello@devstackbox.com)
- Issues: [GitHub Issues](https://github.com/DevStackBox/DevStackBox/issues)
- Discussions: [GitHub Discussions](https://github.com/DevStackBox/DevStackBox/discussions)
- Privacy: [PRIVACY.md](PRIVACY.md) · Security: [SECURITY.md](SECURITY.md) · License: [MIT](LICENSE)
