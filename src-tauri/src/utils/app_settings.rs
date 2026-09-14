// Desktop app preferences mirrored from the frontend (minimize-to-tray, etc.).

use serde::{Deserialize, Serialize};

use crate::utils::paths::user_config_dir;

const SETTINGS_FILE: &str = "app-settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
    #[serde(default)]
    pub auto_start_apache: bool,
    #[serde(default)]
    pub auto_start_mysql: bool,
    #[serde(default = "default_stable_channel")]
    pub update_channel: String,
}

fn default_true() -> bool {
    true
}

fn default_stable_channel() -> String {
    "stable".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            auto_start_apache: false,
            auto_start_mysql: false,
            update_channel: default_stable_channel(),
        }
    }
}

fn settings_path() -> std::path::PathBuf {
    user_config_dir().join(SETTINGS_FILE)
}

pub fn read_app_settings() -> AppSettings {
    let path = settings_path();
    if !path.exists() {
        return AppSettings::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn write_app_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize app settings: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write app settings: {}", e))
}
