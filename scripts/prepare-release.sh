#!/bin/bash
# DevStackBox Release Script v0.1.0-alpha.1

echo "🚀 DevStackBox Release Helper"
echo "================================"

# Check if build artifacts exist
if [ ! -f "src-tauri/target/release/bundle/msi/DevStackBox_0.1.0-alpha.1_x64_en-US.msi" ]; then
    echo "❌ MSI installer not found. Please run 'npm run tauri build' first."
    exit 1
fi

if [ ! -f "src-tauri/target/release/bundle/nsis/DevStackBox_0.1.0-alpha.1_x64-setup.exe" ]; then
    echo "❌ NSIS installer not found. Please run 'npm run tauri build' first."
    exit 1
fi

echo "✅ Build artifacts found!"

# Create release directory
mkdir -p release

# Copy installers
cp "src-tauri/target/release/bundle/msi/DevStackBox_0.1.0-alpha.1_x64_en-US.msi" release/
cp "src-tauri/target/release/bundle/nsis/DevStackBox_0.1.0-alpha.1_x64-setup.exe" release/

# Copy release notes
cp RELEASE_NOTES.md release/

echo "📦 Release assets prepared in ./release/ directory:"
ls -la release/

echo ""
echo "🎯 Next Steps:"
echo "1. Create a new release on GitHub: https://github.com/DevStackBox/DevStackBox/releases/new"
echo "2. Tag: v0.1.0-alpha.1"
echo "3. Title: DevStackBox v0.1.0-alpha.1 - First Alpha Release"
echo "4. Upload these files as release assets:"
echo "   - DevStackBox_0.1.0-alpha.1_x64_en-US.msi"
echo "   - DevStackBox_0.1.0-alpha.1_x64-setup.exe"
echo "5. Use RELEASE_NOTES.md as the release description"
echo "6. Mark as 'Pre-release' since it's an alpha"
echo ""
echo "🔗 GitHub Release URL: https://github.com/DevStackBox/DevStackBox/releases/new"
