# DevStackBox - Security Policy

## Supported versions

| Version | Security fixes |
| ------- | -------------- |
| v0.1.11+ | Yes |
| Older   | Update to latest release |

## Report a vulnerability

Email **hello@devstackbox.com**. Do not use public GitHub issues for security reports.

Include version, OS, steps to reproduce, and impact. We respond within 7 days.

## What DevStackBox does locally

- Starts and stops Apache, MySQL, and PHP
- Reads and writes config files on your PC
- Downloads PHP builds from `windows.php.net` when you choose **Download** on the PHP Versions page
- May edit the Windows `hosts` file for virtual hosts (with your consent)
- Opens `localhost` in your browser

## What it does not do

- No telemetry or usage analytics
- No background cloud sync
- No account system

## PHP downloads

Downloads use HTTPS from `windows.php.net`. The app verifies SHA-256 checksums from the official release metadata before extracting.

## Windows SmartScreen

The installer is signed for in-app updates (minisign). It is not Windows Authenticode-signed. If SmartScreen warns about an unknown publisher, verify that the file came from the official GitHub release and compare its SHA-256 digest where provided. Only continue if you trust the source. Updater signature verification does not establish Windows publisher identity. See [Downloads](https://www.devstackbox.com/download).

## Binary integrity

Install to a folder you control (default `C:\devstackbox`). Do not run from untrusted network shares.
