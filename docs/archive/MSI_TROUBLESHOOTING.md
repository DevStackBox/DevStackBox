# MSI Installer Issues - Diagnosis & Fixes

## Issues Identified

### 1. Installation Directory Problem
- **Problem**: MSI installs to `C:\Program Files\DevStackBox\` instead of `C:\dsb\`
- **Cause**: Tauri's default WiX template overrides custom directory settings
- **Fix Applied**: Enhanced WiX fragment with custom actions that run early in installation sequence

### 2. File Display Issue During Installation
- **Problem**: Installer shows "[1] size: [1]" instead of actual filenames
- **Cause**: Likely due to glob patterns in resources causing WiX file enumeration issues
- **Investigation**: Need to check if file count/names are properly enumerated

### 3. Apache Startup Failure in Installed Version
- **Problem**: Apache won't start when installed via MSI
- **Potential Causes**: 
  - Path detection issues in installed environment
  - Permission problems in Program Files
  - Missing configuration files
  - Incorrect working directory

## Fixes Implemented

### Enhanced Path Detection
```rust
fn get_installation_path() -> PathBuf {
    // 1. Check executable location first
    // 2. Validate server components exist
    // 3. Fallback to common paths
    // 4. Better Program Files handling
}
```

### Improved WiX Configuration
```xml
<!-- Custom actions with proper sequence timing -->
<CustomAction Id="OverrideInstallDir" Property="APPLICATIONFOLDER" Value="C:\dsb\" Execute="immediate" />
<InstallExecuteSequence>
  <Custom Action="OverrideInstallDir" After="LaunchConditions">NOT Installed</Custom>
</InstallExecuteSequence>
```

### Debug Commands Added
- `debug_installation()`: Shows detailed path detection and component status
- `test_apache_config()`: Tests Apache configuration without starting service
- Enhanced error reporting with full paths and permission checks

### Terminal Flashing Fix
- All commands use `CREATE_NO_WINDOW` flag
- Hidden window creation for service startup
- No more command prompt flashing

## Testing Approach

1. **Install MSI and Check**:
   - Installation directory: Should be `C:\dsb\`
   - Component files: All server files should be present
   - Permissions: Read/execute access to binaries

2. **Debug Commands**:
   - Run `debug_installation` to see path detection results
   - Run `test_apache_config` to check Apache configuration
   - Verify server component existence and accessibility

3. **Service Startup**:
   - Check if Apache config test passes
   - Verify working directory is correct
   - Test manual Apache startup from command line

## Expected Results After Fixes

✅ **MSI Installation**: Should install to `C:\dsb\` instead of Program Files
✅ **File Display**: Should show proper filenames during installation  
✅ **Apache Startup**: Should start successfully from installed location
✅ **Debug Info**: Should provide detailed troubleshooting information
✅ **No Terminal Flashing**: Services start silently in background

## If Issues Persist

If MSI still installs to Program Files:
1. Check WiX log files for custom action execution
2. Verify property values during installation
3. Consider using MSI command line: `msiexec /i installer.msi APPLICATIONFOLDER="C:\dsb\"`

If Apache still won't start:
1. Use `debug_installation` to check detected paths
2. Use `test_apache_config` to verify configuration
3. Check file permissions in installation directory
4. Verify config files were created properly
