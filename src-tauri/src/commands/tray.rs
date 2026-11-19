// System tray commands.

use tauri::tray::TrayIconId;

#[tauri::command]
pub async fn show_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::tray::reveal(&app_handle)
}

#[tauri::command]
pub async fn hide_to_tray(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::tray::hide(&app_handle)
}

#[tauri::command]
pub async fn quit_app(app_handle: tauri::AppHandle) -> Result<(), String> {
    if crate::commands::database_workspace::has_active_database_operation() { return Err("A database operation is running. Cancel it or wait before quitting.".into()); }
    app_handle.exit(0);
    Ok(())
}

// Retained for callers that explicitly set a custom tooltip.
#[tauri::command]
pub async fn set_tray_tooltip(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    let tray_id = TrayIconId::new("main");
    if let Some(tray) = app_handle.tray_by_id(&tray_id) {
        tray.set_tooltip(Some(text)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Return the same observations used by the native tray monitor.
#[tauri::command]
pub async fn refresh_tray_menu(app_handle: tauri::AppHandle) -> crate::tray::ServiceStatusSnapshot {
    crate::tray::refresh_tray_status(&app_handle).await
}
