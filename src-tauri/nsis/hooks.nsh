; DevStackBox NSIS hooks - install/uninstall logging and cleanup

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

!macro LogPhaseEnd
  DetailPrint ""
!macroend

!macro DsbLocalTimeStamp outVar
  System::Call "kernel32::GetLocalTime(*i.r9)"
  System::Call "*$9(&i2,&i2,&i2.r3,&i2,&i2.r4,&i2.r5,&i2.r6,&i2)"
  IntOp $R0 $3 * 86400
  IntOp $R1 $4 * 3600
  IntOp $R1 $R1 + $5
  IntOp $R1 $R1 * 60
  IntOp $R1 $R1 + $6
  IntOp $R0 $R0 + $R1
  StrCpy ${outVar} $R0
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
  SetDetailsPrint textonly
!macroend

!macro ForceStopInstDirProcesses
  ; Inlined (not DsbExecSilent): '' in PowerShell literals splits nested macro args.
  SetDetailsPrint none
  nsExec::Exec 'powershell -NoProfile -Command "Get-Process | Where-Object { $$_.Path -like ''$INSTDIR*'' -and $$_.Name -match ''^(httpd|mysqld|php-cgi|php)$$'' } | Stop-Process -Force"'
  Pop $0
  SetDetailsPrint textonly
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
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R2 "$INSTDIR"
  SetDetailsPrint none
  nsExec::Exec 'powershell -NoProfile -Command "if (Get-Process -Name ''$R0'' -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like ''$R2*'' }) { exit 0 } else { exit 1 }"'
  Pop $R1
  SetDetailsPrint textonly
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
  Push $R3
  DetailPrint "Stopping $R1..."
  Push $R0
  Call DsbProcessRunningUnderInstDir
  Pop $R3
  StrCmp $R3 1 stop_done

  SetDetailsPrint none
  nsExec::Exec '$R2'
  Pop $R3
  SetDetailsPrint textonly

  Push $R0
  Call DsbWaitProcessExitUnderInstDir
  Pop $R3
  StrCmp $R3 0 stop_ok

  DetailPrint "$R1 did not stop within the expected time."
  DetailPrint "Attempting forced shutdown..."
  !insertmacro ForceStopInstDirProcesses
  Sleep 1000
  stop_ok:
  DetailPrint "$R1 stopped."
  stop_done:
  Pop $R3
FunctionEnd

!macro StopServicesForUpgrade
  ${If} $UpdateMode = 1
    DetailPrint "Stopping services before upgrade..."
    SetShellVarContext current
    !insertmacro ResolveHttpdPath $R8
    !insertmacro ResolveMysqlAdminPath $R9
    StrCpy $R7 "$LOCALAPPDATA\devstackbox\config"

    StrCpy $R0 "httpd"
    StrCpy $R1 "Apache"
    StrCpy $R2 '"$R8" -f "$R7\httpd.conf" -k stop'
    Call DsbStopNamedService

    StrCpy $R0 "mysqld"
    StrCpy $R1 "MySQL"
    StrCpy $R2 '"$R9" --defaults-file="$R7\my.cnf" -h 127.0.0.1 --protocol=TCP shutdown'
    Call DsbStopNamedService
  ${EndIf}
!macroend

!macro ProtectWwwBeforeInstall
  ${If} ${FileExists} "$INSTDIR\www\*.*"
    DetailPrint "Preserving existing websites..."
    Rename "$INSTDIR\www" "$INSTDIR\_www_preserve"
  ${EndIf}
!macroend

!macro RestoreWwwAfterInstall
  ${If} ${FileExists} "$INSTDIR\_www_preserve"
    RmDir /r /REBOOTOK "$INSTDIR\www"
    Rename "$INSTDIR\_www_preserve" "$INSTDIR\www"
    DetailPrint "Websites preserved."
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
  SetDetailsPrint none
  nsExec::Exec 'powershell -NoProfile -Command "if (Get-Process -Name ''$R0'' -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like ''$R2*'' }) { exit 0 } else { exit 1 }"'
  Pop $R1
  SetDetailsPrint textonly
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
  SetDetailsPrint textonly

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
  DetailPrint "Apache configured."
  DetailPrint "MySQL configured."
  DetailPrint "PHP configured."
  DetailPrint ""
  DetailPrint "Installation completed successfully."
!macroend

!macro NSIS_HOOK_PREINSTALL
  StrCpy $INSTDIR "C:\devstackbox"
  !insertmacro InstallBegin
  !insertmacro LogPhase 1 7 "Checking existing installation"
  DetailPrint "Install location: C:\devstackbox"
  ${If} $UpdateMode = 1
    DetailPrint "Existing installation detected."
    !insertmacro StopServicesForUpgrade
  ${EndIf}
  !insertmacro ProtectWwwBeforeInstall
  ${If} $UpdateMode = 1
    DetailPrint "Upgrading to ${VERSION}..."
  ${EndIf}
  !insertmacro LogPhaseEnd
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro RestoreWwwAfterInstall
  !insertmacro LogPhase 4 7 "Configuring services"
  ${If} ${FileExists} "$INSTDIR\php\8.3\php.exe"
    ${IfNot} ${FileExists} "$INSTDIR\php\current\php.exe"
      DetailPrint "Configuring PHP current version..."
      Rmdir /r "$INSTDIR\php\current"
      !insertmacro DsbExecSilent 'cmd /c mklink /J "$INSTDIR\php\current" "$INSTDIR\php\8.3"'
    ${EndIf}
  ${EndIf}
  DetailPrint "PHP configuration completed."
  !insertmacro LogPhaseEnd
!macroend
