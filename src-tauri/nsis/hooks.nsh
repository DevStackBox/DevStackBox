; DevStackBox NSIS installer hooks
; Forces C:\DevStackBox as the install directory.
; customPreInstall runs after Tauri's registry/directory logic but before file extraction,
; so it reliably overrides whatever INSTDIR was set to.

!macro customInit
  StrCpy $INSTDIR "C:\DevStackBox"
!macroend

!macro customPreInstall
  StrCpy $INSTDIR "C:\DevStackBox"
!macroend
