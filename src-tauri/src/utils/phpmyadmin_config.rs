use crate::utils::paths::get_installation_path;

const PHPMYADMIN_CONFIG_INC: &str =
    include_str!("../../../config/phpmyadmin.config.inc.php");

/// Writes DevStackBox phpMyAdmin config when missing (e.g. after a bundle refresh without config.inc.php).
pub fn ensure_phpmyadmin_config_inc() -> Result<(), String> {
    let pma_dir = get_installation_path().join("phpmyadmin");
    if !pma_dir.is_dir() {
        return Ok(());
    }
    let config_path = pma_dir.join("config.inc.php");
    if config_path.exists() {
        return Ok(());
    }
    std::fs::write(&config_path, PHPMYADMIN_CONFIG_INC)
        .map_err(|e| format!("Failed to write phpMyAdmin config.inc.php: {e}"))?;
    println!("Created missing phpMyAdmin config at {}", config_path.display());
    Ok(())
}
