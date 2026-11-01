; Hooks Tauri inserts into its NSIS installer (bundle.windows.nsis.installerHooks).

; An install or update replaces aidp.exe in place, but Explorer keeps the icon it
; cached for that path, so the taskbar showed the old icon after the rc.4 update.
; SHCNE_ASSOCCHANGED with SHCNF_FLUSH makes Explorer drop its cached icons. Tauri's
; template has the same call (UPDATEFILEASSOC) but only for file associations.
!macro NSIS_HOOK_POSTINSTALL
  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend
