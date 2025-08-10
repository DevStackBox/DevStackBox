!include "MUI2.nsh"
!include "FileFunc.nsh"

!define PRODUCT_NAME "{{product_name}}"
!define PRODUCT_VERSION "{{version}}"
!define PRODUCT_PUBLISHER "{{author}}"
!define PRODUCT_DESCRIPTION "{{description}}"

Name "${PRODUCT_NAME}"
OutFile "{{out_file}}"

# Default installation directory to C:\dsb
InstallDir "C:\dsb"

# Request application privileges 
RequestExecutionLevel admin

# Interface settings
!define MUI_ABORTWARNING
!define MUI_ICON "{{icon_path}}"

# Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "{{license_path}}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

# Languages
!insertmacro MUI_LANGUAGE "English"

# Version info
VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_DESCRIPTION}"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  
  # Install main application
  {{#each binaries}}
  File "{{this}}"
  {{/each}}
  
  # Install bundled server components
  {{#each resources}}
  File /r "{{this}}"
  {{/each}}
  
  # Create shortcuts
  CreateDirectory "$SMPROGRAMS\DevStackBox"
  CreateShortCut "$SMPROGRAMS\DevStackBox\DevStackBox.lnk" "$INSTDIR\devstackbox.exe"
  CreateShortCut "$DESKTOP\DevStackBox.lnk" "$INSTDIR\devstackbox.exe"
  
  # Write uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  # Registry entries
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevStackBox" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevStackBox" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevStackBox" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevStackBox" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevStackBox" "DisplayVersion" "${PRODUCT_VERSION}"
  
SectionEnd

Section "Uninstall"
  # Remove files
  Delete "$INSTDIR\devstackbox.exe"
  Delete "$INSTDIR\uninstall.exe"
  
  # Remove server components
  RMDir /r "$INSTDIR\apache"
  RMDir /r "$INSTDIR\mysql"
  RMDir /r "$INSTDIR\php"
  RMDir /r "$INSTDIR\phpmyadmin"
  RMDir /r "$INSTDIR\www"
  RMDir /r "$INSTDIR\config"
  
  # Remove shortcuts
  Delete "$SMPROGRAMS\DevStackBox\DevStackBox.lnk"
  Delete "$DESKTOP\DevStackBox.lnk"
  RMDir "$SMPROGRAMS\DevStackBox"
  
  # Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevStackBox"
  
  # Remove installation directory if empty
  RMDir "$INSTDIR"
SectionEnd
