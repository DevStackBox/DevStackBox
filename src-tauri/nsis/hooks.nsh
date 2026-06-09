; DevStackBox NSIS installer hooks (Tauri v2)
;
; Tauri v2 hook macros called by the bundler template:
;   NSIS_HOOK_PREINSTALL  - runs just before file extraction
;   NSIS_HOOK_POSTINSTALL - runs after all files are copied
;
; NOTE: customInit and customPreInstall are Tauri v1 names and are NEVER
;       called by the Tauri v2 template - they were silently ignored.
;
; The install directory is primarily forced to C:\devstackbox by the custom
; template (src-tauri/templates/installer.nsi) in .onInit.
; This hook is a safety net that fires right before file extraction.

!macro NSIS_HOOK_PREINSTALL
  ; ARCH-001: force install dir to C:\devstackbox before file extraction.
  StrCpy $INSTDIR "C:\devstackbox"
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Ensure php/current junction exists after a directory-tree copy.
  ; The bundled default is PHP 8.3; Apache ScriptAlias points at php/current/.
  ${If} ${FileExists} "$INSTDIR\php\8.3\php.exe"
    ${IfNot} ${FileExists} "$INSTDIR\php\current\php.exe"
      Rmdir /r "$INSTDIR\php\current"
      nsExec::ExecToLog 'cmd /c mklink /J "$INSTDIR\php\current" "$INSTDIR\php\8.3"'
    ${EndIf}
  ${EndIf}
!macroend
