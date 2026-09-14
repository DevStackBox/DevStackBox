// Optional stored password for DevStackBox MySQL root (when set via the UI).

use serde::{Deserialize, Serialize};

use crate::utils::paths::user_config_dir;

const CREDENTIALS_FILE: &str = "mysql-root.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StoredRootCredentials {
    #[serde(default)]
    pub password: Option<String>,
}

fn credentials_path() -> std::path::PathBuf {
    user_config_dir().join(CREDENTIALS_FILE)
}

pub fn read_stored_root_password() -> Option<String> {
    let path = credentials_path();
    if !path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&path).ok()?;
    let creds: StoredRootCredentials = serde_json::from_str(&raw).ok()?;
    creds.password.filter(|p| !p.is_empty())
}

pub fn write_stored_root_password(password: Option<String>) -> Result<(), String> {
    let path = credentials_path();
    let creds = StoredRootCredentials { password };
    let json = serde_json::to_string_pretty(&creds)
        .map_err(|e| format!("Failed to serialize MySQL credentials: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write MySQL credentials: {}", e))
}
