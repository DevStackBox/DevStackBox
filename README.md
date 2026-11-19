# DevStackBox

![Release](https://img.shields.io/github/v/release/DevStackBox/DevStackBox?style=flat-square)
![License: MIT](https://img.shields.io/github/license/DevStackBox/DevStackBox?style=flat-square)
![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white)

**Free XAMPP alternative for Windows** - Apache, MySQL 8.4 LTS, phpMyAdmin, and PHP 8.3 in one MIT-licensed desktop app.

![DevStackBox Services workspace in v0.1.19](docs/images/v0.1.19/services.jpg)

[Run two PHP versions side by side on Windows](docs/getting-started/multiple-php-versions-windows.mdx). Verify each website in the browser and compare it with the global PHP command. [Watch the 21-second demo](https://www.devstackbox.com/community#two-php-versions).

## Stack

| In the installer   | In the app (download)                        |
| ------------------ | -------------------------------------------- |
| PHP **8.3.36**     | PHP **8.2.35, 8.4.27, 8.5.12** or newer patches |
| Apache **2.4**     | -                                            |
| MySQL **8.4 LTS**  | -                                            |
| phpMyAdmin **5.2** | -                                            |

DevStackBox bundles PHP 8.3. You can install additional branches in the app and choose the PHP version each local website uses.

## Download

[devstackbox.com/download](https://www.devstackbox.com/download) · [GitHub Releases](https://github.com/DevStackBox/DevStackBox/releases/latest)

1. Run the installer (administrator).
2. Start Apache and MySQL from the app.
3. Open `http://localhost/` and `http://localhost/phpmyadmin/`.

## Features

- One desktop UI for services, configs, SSL, backups, and projects
- Import from XAMPP (`Settings → Import from XAMPP`)
- No telemetry · offline-friendly after install

## Docs

[devstackbox.com/docs](https://www.devstackbox.com/docs)

Using an AI coding tool? Give it [DEVSTACKBOX.md](DEVSTACKBOX.md) for runtime discovery, project setup and database guidance.

## Project workspaces

Connect existing folders, manage `.test` hosts and trusted HTTPS, and select an installed PHP version per website. Download extra runtimes in PHP Versions first. The terminal currently uses global PHP.

See the [project guide](docs/getting-started/projects.mdx), [project roadmap](PROJECT-ROADMAP.md), and [release validation](docs/RELEASE-VALIDATION.md). Framework installers, database linking and Git/SSH are future work. Frameworks will download on demand; AI integration is deferred.

## Releasing

Maintainers: follow [Release process](docs/development/release-process.mdx) and the [Release runbook](docs/development/release-runbook.mdx) for signed builds, `finalize-release`, and GitHub publication. Download links for users always resolve to the [latest published GitHub release](https://github.com/DevStackBox/DevStackBox/releases/latest).

## Diagnostics and configuration safety

Read Apache and the selected PHP runtime error log from project details. Site changes preserve recovery copies and stop before overwriting unrelated hosts missing from saved records. See [release notes](CHANGELOG.md) for scope and limitations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Links

- Website: [devstackbox.com](https://www.devstackbox.com)
- Issues: [GitHub Issues](https://github.com/DevStackBox/DevStackBox/issues)
- Security: [SECURITY.md](SECURITY.md) · Privacy: [PRIVACY.md](PRIVACY.md)
