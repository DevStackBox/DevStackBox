; DevStackBox NSIS hooks — install/uninstall logging and cleanup (v6)

; ---------------------------------------------------------------------------
; Logging
; ---------------------------------------------------------------------------

!macro SetLogNormal
  SetDetailsPrint textonly
!macroend

!macro LogPhase current total message
  DetailPrint ""
  DetailPrint "[${current}/${total}] ${message}..."
!macroend

!macro LogInfo message
  DetailPrint "${message}"
!macroend

!macro LogOk message
  DetailPrint "${message}"
!macroend

!macro LogWarn message
  DetailPrint "${message}"
!macroend

!macro LogFail message
  DetailPrint "${message}"
!macroend

!macro LogStartTimer
  System::Call "kernel32::GetTickCount() i .r0"
  StrCpy $LogStartTick $0
!macroend

!macro LogDuration
  System::Call "kernel32::GetTickCount() i .r0"
  IntOp $R0 $R0 - $LogStartTick
  IntOp $R0 $R0 / 1000
  DetailPrint ""
  DetailPrint "Duration: $R0 seconds"
!macroend

; ---------------------------------------------------------------------------
; Path resolution
; ---------------------------------------------------------------------------

!macro ResolveHttpdPath outVar
  ${If} ${FileExists} "$INSTDIR\apache\bin\httpd.exe"
    StrCpy ${outVar} "$INSTDIR\apache\bin\httpd.exe"
  ${Else}
    StrCpy ${outVar} "$INSTDIR\apache\httpd.exe"
  ${EndIf}
!macroend

!macro ResolveMysqldPath outVar
  ${If} ${FileExists} "$INSTDIR\mysql\bin\mysqld.exe"
    StrCpy ${outVar} "$INSTDIR\mysql\bin\mysqld.exe"
  ${Else}
    StrCpy ${outVar} "$INSTDIR\mysql\mysqld.exe"
  ${EndIf}
!macroend

!macro ResolveMysqlAdminPath outVar
  ${If} ${FileExists} "$INSTDIR\mysql\bin\mysqladmin.exe"
    StrCpy ${outVar} "$INSTDIR\mysql\bin\mysqladmin.exe"
  ${Else}
    StrCpy ${outVar} "$INSTDIR\mysql\mysqladmin.exe"
  ${EndIf}
!macroend

!macro ResolvePhpPath outVar
  ${If} ${FileExists} "$INSTDIR\php\current\php.exe"
    StrCpy ${outVar} "$INSTDIR\php\current\php.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\php\8.3\php.exe"
    StrCpy ${outVar} "$INSTDIR\php\8.3\php.exe"
  ${Else}
    StrCpy ${outVar} "$INSTDIR\php\php.exe"
  ${EndIf}
!macroend

; ---------------------------------------------------------------------------
; Process helpers (uninstall)
; ---------------------------------------------------------------------------

Function un.DsbProcessRunningUnderInstDir
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R2 "$INSTDIR"
  nsExec::ExecToLog 'powershell -NoProfile -Command "if (Get-Process -Name ''$R0'' -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like ''$R2*'' }) { exit 0 } else { exit 1 }"'
  Pop $R1
  StrCmp $R1 "0" running notrunning
  running:
    StrCpy $R0 0
    Goto done
  notrunning:
    StrCpy $R0 1
  done:
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

Function un.DsbWaitProcessExitUnderInstDir
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R2 0
  wait_loop:
    Push $R0
    Call un.DsbProcessRunningUnderInstDir
    Pop $R1
    StrCmp $R1 1 exited
    IntOp $R2 $R2 + 1
    IntCmp $R2 20 timed_out
    Sleep 500
    Goto wait_loop
  exited:
    StrCpy $R0 0
    Goto wait_done
  timed_out:
    StrCpy $R0 1
  wait_done:
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd

!macro ForceStopInstDirProcesses
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-Process -Name httpd,mysqld,php-cgi,php -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like ''$INSTDIR*'' } | Stop-Process -Force"'
!macroend

Function un.DsbLogServiceStatus
  Exch $R0
  Exch
  Exch $R1
  Push $R2
  Push $R0
  Call un.DsbProcessRunningUnderInstDir
  Pop $R2
  StrCmp $R2 0 0 +3
    DetailPrint "  $R1      Running"
    Goto done
  DetailPrint "  $R1      Not running"
  done:
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

Function un.DsbStopNamedService
  ; Input: R0=processName R1=displayName R2=gracefulCmdLine
  Push $R3
  DetailPrint "Stopping $R1..."
  Push $R0
  Call un.DsbProcessRunningUnderInstDir
  Pop $R3
  StrCmp $R3 1 stop_done

  nsExec::ExecToLog '$R2'
  Push $R0
  Call un.DsbWaitProcessExitUnderInstDir
  Pop $R3
  StrCmp $R3 0 stop_ok

  DetailPrint "$R1 did not stop within the expected time."
  DetailPrint "Attempting forced shutdown..."
  !insertmacro ForceStopInstDirProcesses
  Sleep 1000
  Push $R0
  Call un.DsbProcessRunningUnderInstDir
  Pop $R3
  StrCmp $R3 1 stop_fail
  stop_ok:
  DetailPrint "$R1 stopped."
  Goto stop_done
  stop_fail:
  DetailPrint "Failed to stop $R1."
  stop_done:
  Pop $R3
FunctionEnd

!macro StopDevStackBoxServices
  DetailPrint "Checking running services..."
  DetailPrint ""
  Push "httpd"
  Push "Apache     "
  Call un.DsbLogServiceStatus
  Push "mysqld"
  Push "MySQL      "
  Call un.DsbLogServiceStatus
  Push "php-cgi"
  Push "PHP CGI    "
  Call un.DsbLogServiceStatus
  DetailPrint ""

  SetShellVarContext current
  !insertmacro ResolveHttpdPath $R8
  !insertmacro ResolveMysqlAdminPath $R9
  StrCpy $R7 "$LOCALAPPDATA\devstackbox\config"

  StrCpy $R0 "httpd"
  StrCpy $R1 "Apache"
  StrCpy $R2 '"$R8" -f "$R7\httpd.conf" -k stop'
  Call un.DsbStopNamedService

  StrCpy $R0 "mysqld"
  StrCpy $R1 "MySQL"
  StrCpy $R2 '"$R9" --defaults-file="$R7\my.cnf" -h 127.0.0.1 --protocol=TCP shutdown'
  Call un.DsbStopNamedService

  Push "httpd"
  Call un.DsbProcessRunningUnderInstDir
  Pop $R0
  StrCmp $R0 1 check_mysql_wait
  DetailPrint "Waiting for services to stop..."
  Push "mysqld"
  Call un.DsbProcessRunningUnderInstDir
  Pop $R0
  StrCmp $R0 1 services_waiting
  Goto services_done
  check_mysql_wait:
  Push "mysqld"
  Call un.DsbProcessRunningUnderInstDir
  Pop $R0
  StrCmp $R0 1 services_waiting
  DetailPrint "Waiting for services to stop..."
  Goto services_done
  services_waiting:
  DetailPrint "MySQL is still running."
  DetailPrint "Waiting for services to stop..."
  services_done:
!macroend

; ---------------------------------------------------------------------------
; Uninstall cleanup
; ---------------------------------------------------------------------------

!macro RenameWwwForKeep
  ${If} $KeepWwwCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ${If} ${FileExists} "$INSTDIR\www"
      Rename "$INSTDIR\www" "$INSTDIR\_www_keep"
    ${EndIf}
  ${EndIf}
!macroend

!macro RestoreWwwAfterDelete
  ${If} $KeepWwwCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ${If} ${FileExists} "$INSTDIR\_www_keep"
      Rename "$INSTDIR\_www_keep" "$INSTDIR\www"
    ${EndIf}
  ${EndIf}
!macroend

!macro PreserveWebsiteFolder
  ${If} $UpdateMode = 1
    DetailPrint "Update mode — preserving install layout."
  ${ElseIf} $KeepWwwCheckboxState = 1
    DetailPrint "Preserving websites..."
    DetailPrint "Websites preserved."
  ${EndIf}
!macroend

!macro RemoveInstallComponent name
  ${If} ${FileExists} "$INSTDIR\${name}"
    DetailPrint "Removing ${name}..."
    RmDir /r /REBOOTOK "$INSTDIR\${name}"
  ${EndIf}
!macroend

!macro DeleteInstallFiles
  ${If} $UpdateMode = 1
    DetailPrint "Update mode — skipping application file removal."
  ${Else}
    !insertmacro RenameWwwForKeep
    !insertmacro RemoveInstallComponent "apache"
    !insertmacro RemoveInstallComponent "mysql"
    !insertmacro RemoveInstallComponent "php"
    !insertmacro RemoveInstallComponent "phpmyadmin"
    !insertmacro RemoveInstallComponent "logs"
    !insertmacro RemoveInstallComponent "temp"
    !insertmacro RemoveInstallComponent "cache"
    !insertmacro RemoveInstallComponent "runtime"
    !insertmacro RemoveInstallComponent "bin"
    ${If} $KeepWwwCheckboxState = 0
      !insertmacro RemoveInstallComponent "www"
    ${EndIf}
    Delete "$INSTDIR\${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\uninstall.exe"
    !insertmacro RestoreWwwAfterDelete
    DetailPrint "Application files removed."
  ${EndIf}
!macroend

!macro DeleteUserData
  ${If} $UpdateMode = 1
    DetailPrint "Update mode — keeping application data."
  ${ElseIf} $KeepUserDataCheckboxState = 1
    DetailPrint "Preserving application data."
  ${Else}
    DetailPrint "Removing application data..."
    SetShellVarContext current
    ${If} ${FileExists} "$LOCALAPPDATA\devstackbox"
      RmDir /r /REBOOTOK "$LOCALAPPDATA\devstackbox"
    ${EndIf}
    RmDir /r /REBOOTOK "$LOCALAPPDATA\${BUNDLEID}"
    RmDir /r /REBOOTOK "$APPDATA\${BUNDLEID}"
    ${If} ${FileExists} "$LOCALAPPDATA\devstackbox"
      DetailPrint "Application data is currently in use."
      DetailPrint "It will be removed after the next system restart."
    ${Else}
      DetailPrint "Application data removed."
    ${EndIf}
  ${EndIf}
!macroend

!macro CleanShortcutsUninstall
  ${If} $UpdateMode <> 1
    DetailPrint "Cleaning shortcuts..."
    !insertmacro DeleteAppUserModelId
    !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
    DetailPrint "Shortcuts cleaned."
  ${EndIf}
!macroend

!macro CleanRegistryUninstall
  ${If} $UpdateMode <> 1
    DetailPrint "Cleaning registry..."
    !if "${INSTALLMODE}" == "both"
      DeleteRegKey SHCTX "${UNINSTKEY}"
    !else if "${INSTALLMODE}" == "perMachine"
      DeleteRegKey HKLM "${UNINSTKEY}"
    !else
      DeleteRegKey HKCU "${UNINSTKEY}"
    !endif
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    ${If} $KeepUserDataCheckboxState = 0
      DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
      DeleteRegKey /ifempty SHCTX "${MANUKEY}"
      DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
      DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
      DeleteRegKey /ifempty HKCU "${MANUKEY}"
    ${EndIf}
    DetailPrint "Registry cleaned."
  ${EndIf}
!macroend

!macro UninstallSummary
  DetailPrint ""
  DetailPrint "Summary"
  DetailPrint ""
  ${If} $UpdateMode <> 1
    DetailPrint "Application files removed."
    ${If} $KeepWwwCheckboxState = 1
      DetailPrint "Websites preserved."
    ${Else}
      DetailPrint "Websites removed."
    ${EndIf}
    ${If} $KeepUserDataCheckboxState = 0
      DetailPrint "Application data removed."
    ${Else}
      DetailPrint "Application data preserved."
    ${EndIf}
  ${Else}
    DetailPrint "Update completed."
  ${EndIf}
  DetailPrint ""
  DetailPrint "Uninstallation completed successfully."
!macroend

!macro UninstallBegin
  !insertmacro SetLogNormal
  ${If} $UpdateMode = 1
    DetailPrint "Initializing update..."
  ${Else}
    DetailPrint "Initializing uninstallation..."
  ${EndIf}
  !insertmacro LogStartTimer
!macroend

; ---------------------------------------------------------------------------
; Install validation and logging
; ---------------------------------------------------------------------------

!macro ValidateInstallation
  DetailPrint "Checking Apache..."
  !insertmacro ResolveHttpdPath $R8
  ${IfNot} ${FileExists} "$R8"
    DetailPrint "Failed to validate Apache installation."
  ${EndIf}
  DetailPrint "Checking MySQL..."
  !insertmacro ResolveMysqldPath $R8
  ${IfNot} ${FileExists} "$R8"
    DetailPrint "Failed to validate MySQL installation."
  ${EndIf}
  DetailPrint "Checking PHP..."
  !insertmacro ResolvePhpPath $R8
  ${IfNot} ${FileExists} "$R8"
    DetailPrint "Failed to validate PHP installation."
  ${EndIf}
  DetailPrint "Validation completed."
!macroend

!macro InstallBegin
  !insertmacro SetLogNormal
  DetailPrint "Initializing installation..."
  !insertmacro LogStartTimer
!macroend

!macro InstallSummary
  DetailPrint ""
  DetailPrint "Summary"
  DetailPrint ""
  DetailPrint "Installation completed successfully."
!macroend

!macro NSIS_HOOK_PREINSTALL
  StrCpy $INSTDIR "C:\devstackbox"
  SetOutPath "$INSTDIR"
  !insertmacro InstallBegin
  !insertmacro LogPhase 1 7 "Checking existing installation"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro LogPhase 4 7 "Configuring components"
  ${If} ${FileExists} "$INSTDIR\php\8.3\php.exe"
    ${IfNot} ${FileExists} "$INSTDIR\php\current\php.exe"
      Rmdir /r "$INSTDIR\php\current"
      nsExec::ExecToLog 'cmd /c mklink /J "$INSTDIR\php\current" "$INSTDIR\php\8.3"'
    ${EndIf}
  ${EndIf}
  DetailPrint "Configuration completed."
!macroend
