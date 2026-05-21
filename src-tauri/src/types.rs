// Shared serializable types returned to the frontend.

#[derive(serde::Serialize)]
pub struct ServiceInfo {
    pub running: bool,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub version: Option<String>,
}

#[derive(serde::Serialize)]
pub struct PHPVersionInfo {
    pub version: String,
    pub status: String, // "installed", "available", "downloading"
    pub path: String,
    pub is_active: bool,
    pub installed: bool,
    pub download_url: String,
}

/// Per-database metadata for the Databases page row UI.
/// Aggregates table count + total size (data + index bytes) from
/// `information_schema.tables` in a single query.
#[derive(serde::Serialize)]
pub struct DatabaseInfo {
    pub name: String,
    pub table_count: u64,
    pub size_bytes: u64,
}

/// Diagnostic snapshot shown on the About page.
#[derive(serde::Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub os_version: String,
    pub app_version: String,
    pub tauri_version: String,
    pub apache_version: Option<String>,
    pub mysql_version: Option<String>,
    pub php_versions: Vec<String>,
}
