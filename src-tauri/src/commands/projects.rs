use crate::utils::paths::user_www_dir;
use std::{fs, path::PathBuf};
use tauri_plugin_opener::OpenerExt;

#[derive(serde::Serialize)]
pub struct ProjectDiagnostics {
    pub https: super::ssl::SiteHealth,
    pub website_status: Option<u16>,
    pub website_message: String,
    pub folder_message: Option<String>,
    pub configuration_warnings: Vec<String>,
}

fn document_root_message(root: &std::path::Path) -> Option<String> {
    if root.join("public/index.php").is_file() {
        return Some("This folder contains public/index.php. For Laravel, select the public folder as the document root so private application files are not served.".into());
    }
    match fs::read_dir(root) {
        Err(e) => Some(format!("Document root cannot be read: {e}")),
        Ok(mut files) => match files.next() {
            None => Some("This folder is empty. Add your website files or choose its actual document root. HTTPS does not create a website.".into()),
            Some(Err(e)) => Some(format!("Document root cannot be read: {e}")),
            _ => None,
        },
    }
}

fn response_message(status: u16) -> String {
    match status {
        200..=299 => format!("Website responded with HTTP {status}"),
        300..=399 => format!("Website redirects (HTTP {status}); destination was not checked"),
        403 => "HTTP 403: check the document root, index file and Apache permissions".into(),
        404 => "HTTP 404: check the document root, index file and application routes".into(),
        500..=599 => format!("HTTP {status}: check the application and Apache error logs"),
        _ => format!("Website responded with HTTP {status}"),
    }
}

fn compare_configuration(name: &str, actual: &str, expected: &str) -> Option<String> {
    // Normalize line endings only: do not hide differences in paths, handlers or aliases.
    if actual.replace("\r\n", "\n").trim() == expected.replace("\r\n", "\n").trim() {
        None
    } else {
        Some(format!("{name} differs from saved sites. Back up and review the generated configuration before applying site changes; it may contain manual or interrupted changes."))
    }
}

fn configuration_warnings(sites: &[super::vhosts::VhostEntry]) -> Vec<String> {
    let config = crate::utils::paths::user_config_dir();
    let mut expected_http =
        String::from("# Managed DevStackBox sites; localhost is defined in httpd.conf\n");
    for entry in sites.iter().filter(|s| s.enabled) {
        match super::vhosts::render_site(entry, false) {
            Ok(rendered) => expected_http.push_str(&rendered),
            Err(error) => return vec![error],
        }
    }
    let mut warnings = vec![];
    let mut configurations = vec![("vhosts.conf", expected_http)];
    match super::ssl::render_ssl(sites) {
        Ok(expected) => configurations.push(("ssl.conf", expected)),
        Err(error) => warnings.push(error),
    }
    for (name, expected) in configurations {
        match fs::read_to_string(config.join(name)) {
            Ok(actual) => {
                if let Some(message) = compare_configuration(name, &actual, &expected) {
                    warnings.push(message);
                }
            }
            Err(e)
                if e.kind() == std::io::ErrorKind::NotFound
                    && (expected.is_empty()
                        || (name == "vhosts.conf" && !sites.iter().any(|s| s.enabled))) => {}
            Err(e) => warnings.push(format!("Cannot inspect {name}: {e}")),
        }
    }
    warnings
}

#[tauri::command]
pub async fn get_site_configuration_warnings() -> Result<Vec<String>, String> {
    let _guard = super::ssl::SITE_LOCK.lock().await;
    let _process_lock = super::ssl::lock_configuration()?;
    Ok(configuration_warnings(&super::vhosts::load_vhosts()?))
}

#[tauri::command]
pub async fn get_project_diagnostics(project_id: String) -> Result<ProjectDiagnostics, String> {
    // Avoid reading half of another site's configuration transaction.
    let _guard = super::ssl::SITE_LOCK.lock().await;
    let _process_lock = super::ssl::lock_configuration()?;
    let sites = super::vhosts::load_vhosts()?;
    let site = sites
        .iter()
        .find(|s| s.id == project_id)
        .ok_or("Project not found. Refresh the project list.")?;
    let warnings = configuration_warnings(&sites);
    let https = super::ssl::probe(site).await;
    let folder_message = document_root_message(std::path::Path::new(&site.doc_root));
    let mut result = ProjectDiagnostics {
        https,
        website_status: None,
        website_message: "Not checked".into(),
        folder_message,
        configuration_warnings: warnings,
    };
    if !site.enabled {
        result.website_message = "Site disabled".into();
    } else if site.https && !result.https.verified {
        result.website_message = "Website check waits for verified HTTPS".into();
    } else {
        // Pin local checks to loopback and never follow application redirects to other hosts.
        let client = reqwest::Client::builder()
            .use_native_tls()
            .no_proxy()
            .resolve(
                &site.domain,
                std::net::SocketAddr::from(([127, 0, 0, 1], 0)),
            )
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;
        match client.get(&result.https.url).send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                result.website_status = Some(status);
                result.website_message = response_message(status);
            }
            Err(e) => result.website_message = format!("Website could not be reached: {e}"),
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinguishes_errors_and_unverified_redirects() {
        assert!(response_message(404).contains("document root"));
        assert!(response_message(302).contains("not checked"));
        assert!(response_message(500).contains("error logs"));
    }
    #[test]
    fn detects_orphan_generated_sites_and_path_changes() {
        assert!(compare_configuration("ssl.conf", "ServerName a.test", "").is_some());
        assert!(
            compare_configuration("vhosts.conf", "DocumentRoot C:/a", "DocumentRoot C:/b")
                .is_some()
        );
        assert!(compare_configuration("vhosts.conf", "same\r\n", "same\n").is_none());
    }
    #[test]
    fn diagnoses_empty_and_missing_roots_without_creating_files() {
        let dir =
            std::env::temp_dir().join(format!("devstackbox-project-test-{}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        assert!(document_root_message(&dir).unwrap().contains("empty"));
        fs::write(dir.join("index.html"), "hello").unwrap();
        assert!(document_root_message(&dir).is_none());
        fs::remove_file(dir.join("index.html")).unwrap();
        fs::remove_dir(&dir).unwrap();
        assert!(document_root_message(&dir)
            .unwrap()
            .contains("cannot be read"));
    }
}

#[tauri::command]
pub async fn open_project_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() || !path.is_dir() {
        return Err("Project folder does not exist".into());
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn choose_project_folder() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Select project folder")
            .pick_folder()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn create_project_folder(name: String) -> Result<String, String> {
    let name = name.trim();
    let reserved = [
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    if name.is_empty()
        || name.len() > 63
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        || reserved.contains(&name.to_ascii_lowercase().as_str())
    {
        return Err("Use a project name with letters, numbers, hyphens or underscores.".into());
    }
    let path = user_www_dir().join(name);
    fs::create_dir(&path).map_err(|e| {
        format!("Could not create project folder (existing folders are never overwritten): {e}")
    })?;
    fs::write(
        path.join("index.php"),
        "<?php echo 'Your DevStackBox project is ready.';\n",
    )
    .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
#[tauri::command]
pub async fn suggest_document_root(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("Project folder does not exist".into());
    }
    if p.join("public/index.php").is_file() {
        Ok(p.join("public").to_string_lossy().into_owned())
    } else {
        Ok(path)
    }
}
