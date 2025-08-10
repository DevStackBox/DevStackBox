# DevStackBox v0.1.6 Release Notes

## 🎉 New Release - Clean Semantic Versioning & MSI Compatibility

### ✅ Fixed Issues

- **MSI Bundler Compatibility**: Changed version from `0.1.0-alpha.6` to `0.1.6` to fix MSI build failures
- **Clean Semantic Versioning**: Now using standard `MAJOR.MINOR.PATCH` format (no hyphens or text in version)
- **File Structure Cleanup**: Removed duplicate files and build artifacts for cleaner codebase

### 🧹 Cleanup & Optimization

- Removed duplicate files: `globals.css`, `main.tsx`, `index.html` from root (kept proper versions in `src/`)
- Removed empty `postcss.config.js` (kept working `.cjs` version)
- Cleaned temporary files and logs
- Removed build artifacts for cleaner repository

### 🔧 Technical Improvements

- MSI installer now builds successfully with clean version format
- Improved project structure following Vite + React + Tauri best practices
- All source files properly organized in `src/` directory

### 📦 Available Downloads

- **Windows MSI Installer**: `DevStackBox_0.1.6_x64_en-US.msi` (288.9 MB)
- **Windows NSIS Installer**: `DevStackBox_0.1.6_x64-setup.exe` (147.7 MB)

### 🚀 What's Next in v0.1.7

- System tray integration
- Auto-update functionality via GitHub Releases
- Enhanced logs viewer with real-time filtering
- Bug reporting integration with GitHub Issues

---

**Full Changelog**: [v0.1.5...v0.1.6](https://github.com/ProgrammerNomad/DevStackBox/compare/v0.1.5...v0.1.6)

**Installation**: Download the MSI installer and run as administrator for best experience.

**Author**: Nomad Programmer  
**Contact**: [shiv@srapsware.com](mailto:shiv@srapsware.com)
