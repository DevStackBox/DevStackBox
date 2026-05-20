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
