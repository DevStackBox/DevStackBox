!define DSB_UPGRADE_STOP_SCRIPT "${__FILEDIR__}\stop-upgrade-services.ps1"
!define DSB_PMA_PRUNE_SCRIPT "${__FILEDIR__}\prune-phpmyadmin.ps1"
!define DSB_PMA_REPORT "${__FILEDIR__}\..\..\packaging\phpmyadmin-report.json"
; DevStackBox NSIS hooks - install/uninstall logging and cleanup

; ---------------------------------------------------------------------------
; Logging
; ---------------------------------------------------------------------------

!macro SetLogNormal
  SetDetailsPrint both
!macroend

; Restore point used after a temporary `SetDetailsPrint none` around a silent
; nsExec::Exec call. Kept as its own macro (rather than repeating the literal
; "SetDetailsPrint both" everywhere) so a future logging-mode change only
; needs to happen in one place.
!macro SetLogRestore
  SetDetailsPrint both
!macroend

!macro LogPhase current total message
  DetailPrint ""
  DetailPrint "[${current}/${total}] ${message}..."
!macroend

!macro LogPhaseEnd
  DetailPrint ""
!macroend

; Seconds-since-midnight for duration logging.
; Uses FileFunc GetTime - never System::Call (*$9 vs $R9 caused System.dll AV).
!macro DsbLocalTimeStamp outVar
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  IntOp $0 $4 * 3600
  IntOp $1 $5 * 60
  IntOp $0 $0 + $1
  IntOp $0 $0 + $6
  StrCpy ${outVar} $0
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
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
  !insertmacro DsbLocalTimeStamp $LogStartTick
!macroend

!macro LogDuration
  !insertmacro DsbLocalTimeStamp $R0
  IntOp $R0 $R0 - $LogStartTick
  IntCmp $R0 0 +3 0 +3
    IntOp $R0 $R0 + 86400
  IntCmp $R0 0 log_duration_less_than_one
  IntCmp $R0 1 log_duration_one
  DetailPrint ""
  DetailPrint "Duration: $R0 seconds"
  Goto log_duration_done
  log_duration_less_than_one:
  DetailPrint ""
  DetailPrint "Duration: less than 1 second"
  Goto log_duration_done
  log_duration_one:
  DetailPrint ""
  DetailPrint "Duration: 1 second"
  log_duration_done:
!macroend

!macro DsbExecSilent cmd
  ; NSIS splits macro args on commas - commands passed here must not contain literal commas.
  SetDetailsPrint none
  nsExec::Exec '${cmd}'
  Pop $0
  !insertmacro SetLogRestore
!macroend

; Kill processes whose Win32_Process.ExecutablePath is under $INSTDIR only.
; Implemented as Functions (not macros with labels) so callers can invoke repeatedly
; without NSIS "label already declared" errors.
!macro DsbForceKillImageUnderInstDir imageName
  Push $0
  SetDetailsPrint none
  nsExec::Exec `powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq '${imageName}' -and $$_.ExecutablePath -and ($$_.ExecutablePath -like '$INSTDIR\*') } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }; exit 0"`
  Pop $0
  !insertmacro SetLogRestore
  Pop $0
!macroend

Function DsbForceStopInstDirProcesses
  ; Path-scoped PID kill with retries (matches Rust stop_apache / stop_mysql cadence).
  ; Main app binary is killed by the ForceStopInstDirProcesses macro wrapper
  ; (MAINBINARYNAME is not defined yet when this function is compiled from hooks.nsh).
  Push $R6
  StrCpy $R6 0
  force_stop_retry:
    !insertmacro DsbForceKillImageUnderInstDir "httpd.exe"
    !insertmacro DsbForceKillImageUnderInstDir "mysqld.exe"
    !insertmacro DsbForceKillImageUnderInstDir "php-cgi.exe"
    !insertmacro DsbForceKillImageUnderInstDir "php.exe"
    IntOp $R6 $R6 + 1
    IntCmp $R6 4 force_stop_done
    Sleep 750
    Goto force_stop_retry
  force_stop_done:
  Pop $R6
FunctionEnd

Function un.DsbForceStopInstDirProcesses
  Push $R6
  StrCpy $R6 0
  un_force_stop_retry:
    !insertmacro DsbForceKillImageUnderInstDir "httpd.exe"
    !insertmacro DsbForceKillImageUnderInstDir "mysqld.exe"
    !insertmacro DsbForceKillImageUnderInstDir "php-cgi.exe"
    !insertmacro DsbForceKillImageUnderInstDir "php.exe"
    IntOp $R6 $R6 + 1
    IntCmp $R6 4 un_force_stop_done
    Sleep 750
    Goto un_force_stop_retry
  un_force_stop_done:
  Pop $R6
FunctionEnd

; Macro expands at call site so ${MAINBINARYNAME} is available.
!macro ForceStopInstDirProcesses
  Call DsbForceStopInstDirProcesses
  !insertmacro DsbForceKillImageUnderInstDir "${MAINBINARYNAME}.exe"
!macroend

!macro un.ForceStopInstDirProcesses
  Call un.DsbForceStopInstDirProcesses
  !insertmacro DsbForceKillImageUnderInstDir "${MAINBINARYNAME}.exe"
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
; Process helpers (install / upgrade)
; ---------------------------------------------------------------------------

Function DsbProcessRunningUnderInstDir
  ; Input: process base name without .exe (e.g. "httpd"). Returns 0=running under INSTDIR, 1=not.
  ; Uses Win32_Process.ExecutablePath - Get-Process.Path can be empty and false-negative.
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R2 "$INSTDIR"
  SetDetailsPrint none
  nsExec::Exec `powershell -NoProfile -NonInteractive -Command "if (Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq '$R0.exe' -and $$_.ExecutablePath -and ($$_.ExecutablePath -like '$R2\*') }) { exit 0 } else { exit 1 }"`
  Pop $R1
  !insertmacro SetLogRestore
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

Function DsbWaitProcessExitUnderInstDir
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R2 0
  wait_loop:
    Push $R0
    Call DsbProcessRunningUnderInstDir
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

Function DsbStopNamedService
  ; Always attempt graceful stop - process detection via Path can false-negative.
  Push $R3
  Push $R4
  StrCpy $R4 $R0
  DetailPrint "Stopping $R1..."

  SetDetailsPrint none
  nsExec::Exec '$R2'
  Pop $R3
  !insertmacro SetLogRestore

  Push $R4
  Call DsbWaitProcessExitUnderInstDir
  Pop $R3
  StrCmp $R3 0 stop_ok

  DetailPrint "$R1 did not stop within the expected time."
  DetailPrint "Attempting forced shutdown..."
  ; Call function directly - hooks.nsh is included before MAINBINARYNAME is defined,
  ; so the ForceStopInstDirProcesses macro (which expands MAINBINARYNAME) cannot be used here.
  Call DsbForceStopInstDirProcesses
  Sleep 1000
  stop_ok:
  DetailPrint "$R1 stopped."
  Pop $R4
  Pop $R3
FunctionEnd

Function DsbStopServicesBeforeUpgrade
  InitPluginsDir
  File /oname=$PLUGINSDIR\stop-upgrade-services.ps1 "${DSB_UPGRADE_STOP_SCRIPT}"
  DetailPrint "Checking running services and file locks..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stop-upgrade-services.ps1" -InstallDir "$INSTDIR"'
  Pop $R0
  ${If} $R0 != 0
    DetailPrint "Upgrade aborted: services or locked files could not be cleared. No application files replaced."
    SetErrorLevel 1
    Abort
  ${EndIf}
FunctionEnd

!macro StopServicesBeforeUpgrade
  Call DsbStopServicesBeforeUpgrade
!macroend

!macro ProtectWwwBeforeInstall
  ${If} ${FileExists} "$INSTDIR\www\*.*"
    DetailPrint "Preserving existing websites..."
    ${If} ${FileExists} "$INSTDIR\_www_preserve"
      DetailPrint "Upgrade stopped: _www_preserve contains a previous website backup. Restore or move it before retrying."
      SetErrorLevel 1
      Abort
    ${EndIf}
    ClearErrors
    Rename "$INSTDIR\www" "$INSTDIR\_www_preserve"
    ${If} ${Errors}
      DetailPrint "Upgrade stopped: could not preserve www. Close programs using the website folder and retry."
      SetErrorLevel 1
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro RestoreWwwAfterInstall
  ${If} ${FileExists} "$INSTDIR\_www_preserve"
    ClearErrors
    RmDir /r "$INSTDIR\www"
    ${If} ${Errors}
      DetailPrint "Could not clear bundled www files. Existing websites remain in _www_preserve."
      SetErrorLevel 1
      Abort
    ${EndIf}
    Rename "$INSTDIR\_www_preserve" "$INSTDIR\www"
    ${If} ${Errors}
      DetailPrint "Could not restore www. Existing websites remain in _www_preserve."
      SetErrorLevel 1
      Abort
    ${EndIf}
    DetailPrint "Websites preserved."
  ${EndIf}
!macroend

; ---------------------------------------------------------------------------
; Process helpers (uninstall)
; ---------------------------------------------------------------------------

Function un.DsbProcessRunningUnderInstDir
  ; Input: process base name without .exe. Returns 0=running under INSTDIR, 1=not.
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R2 "$INSTDIR"
  SetDetailsPrint none
  nsExec::Exec `powershell -NoProfile -NonInteractive -Command "if (Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq '$R0.exe' -and $$_.ExecutablePath -and ($$_.ExecutablePath -like '$R2\*') }) { exit 0 } else { exit 1 }"`
  Pop $R1
  !insertmacro SetLogRestore
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

Function un.DsbLogServiceStatus
  Exch $R0
  Exch
  Exch $R1
  Push $R2
  Push $R0
  Call un.DsbProcessRunningUnderInstDir
  Pop $R2
  StrCmp $R2 0 0 +3
    DetailPrint "  $R1  Running"
    Goto done
  DetailPrint "  $R1  Not running"
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

  SetDetailsPrint none
  nsExec::Exec '$R2'
  Pop $R3
  !insertmacro SetLogRestore

  Push $R0
  Call un.DsbWaitProcessExitUnderInstDir
  Pop $R3
  StrCmp $R3 0 stop_ok

  DetailPrint "$R1 did not stop within the expected time."
  DetailPrint "Attempting forced shutdown..."
  Call un.DsbForceStopInstDirProcesses
  Sleep 1000
  Push $R0
  Call un.DsbProcessRunningUnderInstDir
  Pop $R3
  StrCmp $R3 1 stop_fail
  stop_ok:
  DetailPrint "$R1 stopped."
  StrCmp $R1 "Apache" 0 check_mysql_stopped
  StrCpy $LogApacheStopped 1
  Goto stop_done
  check_mysql_stopped:
  StrCmp $R1 "MySQL" 0 stop_done
  StrCpy $LogMysqlStopped 1
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
  Push "Apache"
  Call un.DsbLogServiceStatus
  Push "mysqld"
  Push "MySQL"
  Call un.DsbLogServiceStatus
  DetailPrint ""

  ReadEnvStr $R7 "LOCALAPPDATA"
  StrCpy $R7 "$R7\devstackbox\config"
  !insertmacro ResolveHttpdPath $R8
  !insertmacro ResolveMysqlAdminPath $R9

  StrCpy $R0 "httpd"
  StrCpy $R1 "Apache"
  StrCpy $R2 '"$R8" -f "$R7\httpd.conf" -k stop'
  Call un.DsbStopNamedService

  StrCpy $R0 "mysqld"
  StrCpy $R1 "MySQL"
  StrCpy $R2 '"$INSTDIR\devstackbox.exe" --stop-services'
  Call un.DsbStopNamedService

  Push "httpd"
  Call un.DsbProcessRunningUnderInstDir
  Pop $R0
  StrCmp $R0 1 apache_done
  Push "mysqld"
  Call un.DsbProcessRunningUnderInstDir
  Pop $R0
  StrCmp $R0 1 apache_done
  Goto services_done
  apache_done:
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
    DetailPrint "Update mode - preserving install layout."
  ${ElseIf} $KeepWwwCheckboxState = 1
    DetailPrint "Preserving websites..."
    DetailPrint "Websites preserved."
  ${Else}
    DetailPrint "Removing websites..."
    ${If} ${FileExists} "$INSTDIR\www"
      RmDir /r /REBOOTOK "$INSTDIR\www"
    ${EndIf}
    DetailPrint "Websites removed."
  ${EndIf}
!macroend

!macro RemoveInstallComponent folder displayName
  ${If} ${FileExists} "$INSTDIR\${folder}"
    DetailPrint "Removing ${displayName}..."
    RmDir /r /REBOOTOK "$INSTDIR\${folder}"
  ${EndIf}
!macroend

!macro DeleteInstallFiles
  ${If} $UpdateMode = 1
    DetailPrint "Update mode - skipping application file removal."
  ${Else}
    !insertmacro RenameWwwForKeep
    !insertmacro RemoveInstallComponent "apache" "Apache"
    !insertmacro RemoveInstallComponent "mysql" "MySQL"
    !insertmacro RemoveInstallComponent "php" "PHP"
    !insertmacro RemoveInstallComponent "phpmyadmin" "phpMyAdmin"
    !insertmacro RemoveInstallComponent "logs" "logs"
    !insertmacro RemoveInstallComponent "temp" "temp"
    !insertmacro RemoveInstallComponent "cache" "cache"
    !insertmacro RemoveInstallComponent "runtime" "runtime"
    !insertmacro RemoveInstallComponent "bin" "bin"
    !insertmacro RemoveInstallComponent "tools\mkcert" "mkcert"
    Delete "$INSTDIR\https-autosetup"
    Delete "$INSTDIR\${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\uninstall.exe"
    !insertmacro RestoreWwwAfterDelete
    DetailPrint "Application files removed."
  ${EndIf}
!macroend

!macro DeleteUserData
  ${If} $UpdateMode = 1
    DetailPrint "Update mode - keeping application data."
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
    DetailPrint "Removing shortcuts..."
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
    DetailPrint "Shortcuts removed."
  ${EndIf}
!macroend

!macro CleanRegistryUninstall
  ${If} $UpdateMode <> 1
    DetailPrint "Removing registry entries..."
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
    DetailPrint "Registry entries removed."
  ${EndIf}
!macroend

!macro UninstallSummary
  DetailPrint ""
  DetailPrint "Summary"
  DetailPrint ""
  ${If} $UpdateMode <> 1
    ${If} $LogApacheStopped = 1
      DetailPrint "Apache stopped."
    ${EndIf}
    ${If} $LogMysqlStopped = 1
      DetailPrint "MySQL stopped."
    ${EndIf}
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

!macro CleanFileAssociationsBegin
  DetailPrint "Removing file associations..."
!macroend

!macro CleanFileAssociationsEnd
  DetailPrint "File associations removed."
!macroend

; ---------------------------------------------------------------------------
; Install validation and logging
; ---------------------------------------------------------------------------

!macro ValidateInstallation
  StrCpy $ValidationFailures 0
  DetailPrint "Checking Apache..."
  !insertmacro ResolveHttpdPath $R8
  ${If} ${FileExists} "$R8"
    DetailPrint "Apache verified."
  ${Else}
    !insertmacro LogFail "Failed to validate Apache installation."
    IntOp $ValidationFailures $ValidationFailures + 1
  ${EndIf}
  DetailPrint "Checking MySQL..."
  !insertmacro ResolveMysqldPath $R8
  ${If} ${FileExists} "$R8"
    DetailPrint "MySQL verified."
  ${Else}
    !insertmacro LogFail "Failed to validate MySQL installation."
    IntOp $ValidationFailures $ValidationFailures + 1
  ${EndIf}
  DetailPrint "Checking PHP..."
  !insertmacro ResolvePhpPath $R8
  ${If} ${FileExists} "$R8"
    DetailPrint "PHP verified."
  ${Else}
    !insertmacro LogFail "Failed to validate PHP installation."
    IntOp $ValidationFailures $ValidationFailures + 1
  ${EndIf}
  IntCmp $ValidationFailures 0 validation_ok
  DetailPrint "Installation validation failed."
  Abort
  validation_ok:
  DetailPrint "Validation completed."
  !insertmacro LogPhaseEnd
!macroend

!macro InstallBegin
  !insertmacro SetLogNormal
  DetailPrint "Initializing installation..."
  DetailPrint "${PRODUCTNAME} ${VERSION}"
  !insertmacro LogStartTimer
!macroend

!macro InstallSummary
  DetailPrint ""
  DetailPrint "Summary"
  DetailPrint ""
  DetailPrint "Install location:"
  DetailPrint "C:\devstackbox"
  DetailPrint ""
  DetailPrint "Version: ${VERSION}"
  DetailPrint ""
  DetailPrint "- Apache HTTP Server"
  DetailPrint "- MySQL Server"
  DetailPrint "- PHP Runtime"
  DetailPrint "- phpMyAdmin"
  DetailPrint ""
  DetailPrint "Websites folder: C:\devstackbox\www"
  DetailPrint ""
  DetailPrint "Installation completed successfully."
!macroend

; Called from Section Install AFTER CheckIfAppIsRunning so DevStackBox is closed
; before we stop Apache/MySQL and before file copy.
!macro NSIS_HOOK_PREINSTALL
  StrCpy $INSTDIR "C:\devstackbox"
  ; Remove a stale per-user uninstall entry left by earlier builds when this
  ; product migrates to a machine-wide install. Match the exact install path
  ; so another per-user installation can never be removed accidentally.
  !if "${INSTALLMODE}" == "perMachine"
    ReadRegStr $R7 HKCU "${UNINSTKEY}" "InstallLocation"
    ${If} $R7 == "$\"$INSTDIR$\""
      DetailPrint "Removing stale per-user registration for this install path."
      DeleteRegKey HKCU "${UNINSTKEY}"
    ${EndIf}
  !endif
  !insertmacro InstallBegin
  !insertmacro LogPhase 1 7 "Checking existing installation"
  DetailPrint "Install location: C:\devstackbox"
  ${If} $UpdateMode = 1
    DetailPrint "Existing installation detected."
  ${EndIf}
  !insertmacro StopServicesBeforeUpgrade
  ; Preserve the user's phpMyAdmin connection and directory configuration.
  ${If} ${FileExists} "$INSTDIR\phpmyadmin\config.inc.php.dsb-upgrade-backup"
    MessageBox MB_ICONSTOP "A previous phpMyAdmin configuration backup exists. Recover or move config.inc.php.dsb-upgrade-backup before retrying."
    Abort
  ${EndIf}
  InitPluginsDir
  ${If} ${FileExists} "$INSTDIR\phpmyadmin\config.inc.php"
    ClearErrors
    CopyFiles /SILENT "$INSTDIR\phpmyadmin\config.inc.php" "$INSTDIR\phpmyadmin\config.inc.php.dsb-upgrade-backup"
    ${If} ${Errors}
      MessageBox MB_ICONSTOP "Cannot preserve phpMyAdmin configuration. Installation stopped."
      Abort
    ${EndIf}
  ${EndIf}
  !insertmacro ProtectWwwBeforeInstall
  ${If} $UpdateMode = 1
    DetailPrint "Upgrading to ${VERSION}..."
  ${EndIf}
  !insertmacro LogPhaseEnd
!macroend


!macro NSIS_HOOK_POSTINSTALL
  ; Only prune old files that exactly match the approved source hashes.
  ; Modified/custom files and all runtime caches/dumps are preserved.
  File /oname=$PLUGINSDIR\dsb-prune-phpmyadmin.ps1 "${DSB_PMA_PRUNE_SCRIPT}"
  File /oname=$PLUGINSDIR\dsb-phpmyadmin-report.json "${DSB_PMA_REPORT}"
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\dsb-prune-phpmyadmin.ps1" -InstallRoot "$INSTDIR" -Manifest "$PLUGINSDIR\dsb-phpmyadmin-report.json"'
  Pop $R0
  ${If} $R0 != 0
    DetailPrint "Some obsolete phpMyAdmin files could not be cleaned. Existing custom files are preserved."
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\phpmyadmin\config.inc.php.dsb-upgrade-backup"
    ClearErrors
    CopyFiles /SILENT "$INSTDIR\phpmyadmin\config.inc.php.dsb-upgrade-backup" "$INSTDIR\phpmyadmin\config.inc.php"
    ${If} ${Errors}
      MessageBox MB_ICONSTOP "Could not restore phpMyAdmin configuration. Recover config.inc.php.dsb-upgrade-backup in the phpmyadmin installation directory before retrying."
      Abort
    ${EndIf}
  ${EndIf}
  Delete "$INSTDIR\phpmyadmin\config.inc.php.dsb-upgrade-backup"
  !insertmacro RestoreWwwAfterInstall
  !insertmacro LogPhase 4 7 "Configuring services"

  DetailPrint "Apache configuration will be initialized and validated on first start."
  DetailPrint ""

  DetailPrint "MySQL data will be initialized on first start."
  DetailPrint ""

  ${If} ${FileExists} "$INSTDIR\php\8.3\php.exe"
    ${IfNot} ${FileExists} "$INSTDIR\php\current\php.exe"
      DetailPrint "Configuring PHP current version..."
      Rmdir /r "$INSTDIR\php\current"
      !insertmacro DsbExecSilent 'cmd /c mklink /J "$INSTDIR\php\current" "$INSTDIR\php\8.3"'
    ${EndIf}
  ${EndIf}
  DetailPrint "PHP configuration completed."
  ${If} $EnableLocalHttps = 1
    FileOpen $R0 "$INSTDIR\https-autosetup" w
    FileWrite $R0 "Trusted local HTTPS requested during installation."
    FileClose $R0
    DetailPrint "Preparing local HTTPS for the desktop user. Check Apache > HTTPS in the app for the verified result."
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" "--setup-local-https"
  ${Else}
    Delete "$INSTDIR\https-autosetup"
    DetailPrint "Automatic local HTTPS setup was not selected."
  ${EndIf}

  !insertmacro LogPhaseEnd
!macroend
