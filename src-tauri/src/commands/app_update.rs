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
