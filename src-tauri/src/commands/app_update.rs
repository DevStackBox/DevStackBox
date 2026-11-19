// Channel-aware update check (stable vs beta endpoint from app-settings.json).

use serde::Serialize;
use tauri::{Manager, Runtime, Webview};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::utils::app_settings::read_app_settings;

const STABLE_ENDPOINT: &str =
    "https://github.com/DevStackBox/DevStackBox/releases/latest/download/latest.json";
const BETA_ENDPOINT: &str =
    "https://github.com/DevStackBox/DevStackBox/releases/download/v0.1.9-beta/latest.json";

pub fn updater_endpoint_string() -> String {
    if read_app_settings().update_channel == "beta" {
        BETA_ENDPOINT.to_string()
    } else {
        STABLE_ENDPOINT.to_string()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckMetadata {
    rid: tauri::ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[tauri::command]
pub fn get_updater_endpoint() -> Result<String, String> {
    Ok(updater_endpoint_string())
}

/// Keep the same database ownership through download, installer handoff and
/// restart. The Windows updater exits directly; a preflight-only check races.
#[tauri::command]
pub async fn install_app_update<R: Runtime>(
    webview: Webview<R>,
    rid: tauri::ResourceId,
    on_event: tauri::ipc::Channel<serde_json::Value>,
) -> Result<(), String> {
    let _owner = super::mysql_import::MYSQL_DATA_LOCK.try_lock()?;
    if super::apache::get_apache_status().await?.running || super::mysql::get_mysql_status().await?.running {
        return Err("Stop Apache and MySQL before installing the update.".into());
    }
    let update = webview.resources_table().get::<tauri_plugin_updater::Update>(rid).map_err(|e| e.to_string())?;
    let mut started = false;
    update.download_and_install(
        |chunk_length, content_length| {
            if !started { started = true; let _ = on_event.send(serde_json::json!({"event":"Started","data":{"contentLength":content_length}})); }
            let _ = on_event.send(serde_json::json!({"event":"Progress","data":{"chunkLength":chunk_length}}));
        },
        || { let _ = on_event.send(serde_json::json!({"event":"Finished"})); },
    ).await.map_err(|e| e.to_string())?;
    // Windows normally exits inside the updater. On platforms returning here,
    // restart while ownership is still held; do not open a new-operation gap.
    webview.app_handle().restart();
}

#[tauri::command]
pub async fn check_app_update<R: Runtime>(
    webview: Webview<R>,
) -> Result<Option<UpdateCheckMetadata>, String> {
    let url: Url = updater_endpoint_string()
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;

    let update = webview
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| format!("{e}"))?
        .build()
        .map_err(|e| format!("{e}"))?
        .check()
        .await
        .map_err(|e| format!("{e}"))?;

    if let Some(update) = update {
        let formatted_date = update.date.as_ref().map(|d| d.to_string());
        let metadata = UpdateCheckMetadata {
            current_version: update.current_version.clone(),
            version: update.version.clone(),
            date: formatted_date,
            body: update.body.clone(),
            raw_json: update.raw_json.clone(),
            rid: webview.resources_table().add(update),
        };
        Ok(Some(metadata))
    } else {
        Ok(None)
    }
}
