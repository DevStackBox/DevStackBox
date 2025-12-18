# Manual Apache 64-bit Installation Guide

## 📥 Download Steps:

1. **Visit ApacheLounge**: https://www.apachelounge.com/download/
2. **Download**: `httpd-2.4.62-240904-win64-VS17.zip` (or latest VS17 64-bit version)
3. **Extract** to a temporary folder
4. **Copy** the `Apache24` folder contents to replace your current `apache` folder

## 🔄 PowerShell Commands:

```powershell
# After downloading to Downloads folder:
cd "C:\box\DevStackBox"

# Backup current Apache
if (Test-Path "apache") {
    Rename-Item "apache" "apache-backup-32bit"
}

# Extract downloaded ZIP and copy Apache24 contents to apache folder
# Then test with:
npm run tauri dev
```

## ✅ Verification:

After replacement, the error should change from:
"Unsupported 16-Bit Application" 
to either:
- Apache starts successfully ✅
- Different error message (config issue) ⚠️

## 🚀 Alternative: Use Built-in Server Detection

If manual Apache download is difficult, we can modify DevStackBox to detect and guide users through the correct Apache installation.
