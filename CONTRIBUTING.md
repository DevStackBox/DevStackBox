# Contributing to DevStackBox

Thank you for your interest in contributing to DevStackBox.

## Table of Contents
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Guidelines](#development-guidelines)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## Getting Started

DevStackBox is built with:
- **Backend**: Tauri (Rust)
- **Frontend**: Vite + React + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Animations**: Framer Motion
- **i18n**: i18next (English & Hindi)

## Development Setup

### Prerequisites
- Node.js 18+ and pnpm (or npm/yarn)
- Rust 1.70+
- Windows 11 (primary development/test platform)

### Installation
```bash
git clone https://github.com/ProgrammerNomad/DevStackBox.git
cd DevStackBox
pnpm install
pnpm tauri dev
```

### Build for Production
```bash
pnpm tauri build
```

## 📂 Project Structure

```
DevStackBox/
├── src/              # React frontend
│   ├── components/   # UI components (shadcn/ui)
│   ├── pages/        # Page components
│   ├── lib/          # Utilities & i18n
│   └── hooks/        # Custom React hooks
├── src-tauri/        # Rust backend
│   ├── src/          # Tauri commands & service management
│   └── capabilities/ # Tauri permissions
├── config/           # Server config files (httpd.conf, my.cnf, etc.)
├── locales/          # i18next translations (en.json, hi.json)
└── scripts/          # Build & preparation scripts
```

## Development Guidelines

Follow [docs/standards/WRITING_GUIDELINES.md](docs/standards/WRITING_GUIDELINES.md) for user-facing copy.

### UI/UX Rules
- **Only use Tailwind CSS and shadcn/ui** - No custom CSS unless absolutely necessary
- **Dark/light mode required** - All components must support both themes
- **Use Framer Motion** for animations (not CSS keyframes)
- **Responsive design** - Test on different screen sizes

### Code Style
- **TypeScript**: Use strict typing, no `any` unless necessary
- **Rust**: Follow standard Rust conventions, use `cargo fmt`
- **Components**: Keep components small and focused
- **i18n**: All user-facing text must use `t()` from i18next

### Copilot Best Practices
See [.github/copilot-instructions.md](.github/copilot-instructions.md) for detailed GitHub Copilot usage guidelines.

## 🔧 Key Features to Implement

Priority features (see README.md for full list):
1. **Apache Server Management** (High Priority)
2. **Logs Viewer** with real-time updates
3. **Config Editor** with Monaco
4. **Auto-Updater** integration
5. **Database Backup/Restore**

## 📤 Submitting Changes

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** following the guidelines above
4. **Test thoroughly** on Windows 11
5. **Commit**: Use clear, descriptive commit messages
6. **Push**: `git push origin feature/your-feature-name`
7. **Create a Pull Request** with detailed description

### PR Guidelines
- Reference related issues
- Include screenshots/videos for UI changes
- Ensure all tests pass
- Update documentation if needed

## 🐛 Reporting Issues

Use [GitHub Issues](https://github.com/ProgrammerNomad/DevStackBox/issues) to report:
- Bugs
- Feature requests
- Documentation improvements

### Bug Report Template
```markdown
**Environment:**
- DevStackBox Version: 
- OS: Windows 11
- Installation Method: MSI / NSIS

**Description:**
Clear description of the bug

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. ...

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Screenshots:**
If applicable
```

## 📞 Contact

- **Author**: Nomad Programmer
- **Email**: shiv@srapsware.com
- **GitHub**: [ProgrammerNomad/DevStackBox](https://github.com/ProgrammerNomad/DevStackBox)

---

Thank you for contributing to DevStackBox!
