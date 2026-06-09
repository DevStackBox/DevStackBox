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
