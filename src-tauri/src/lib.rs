use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::LazyLock;
use std::process::Command;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::time::sleep;
use std::env;
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
    Manager,
};

// Service manager module
mod service_manager;

// Helper function to check if an executable is 32-bit
#[cfg(windows)]
fn is_32bit_executable(path: &std::path::Path) -> Result<bool, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};
    
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    
    // Read DOS header
    let mut dos_header = [0u8; 64];
    file.read_exact(&mut dos_header).map_err(|e| format!("Failed to read DOS header: {}", e))?;
    
    // Check DOS signature
    if &dos_header[0..2] != b"MZ" {
        return Err("Invalid DOS signature".to_string());
    }
    
    // Get PE header offset
    let pe_offset = u32::from_le_bytes([dos_header[60], dos_header[61], dos_header[62], dos_header[63]]);
    
    // Seek to PE header
    file.seek(SeekFrom::Start(pe_offset as u64)).map_err(|e| format!("Failed to seek to PE header: {}", e))?;
    
    // Read PE signature and machine type
    let mut pe_header = [0u8; 24];
    file.read_exact(&mut pe_header).map_err(|e| format!("Failed to read PE header: {}", e))?;
    
    // Check PE signature
    if &pe_header[0..4] != b"PE\0\0" {
        return Err("Invalid PE signature".to_string());
    }
    
    // Get machine type (bytes 4-5 after PE signature)
    let machine = u16::from_le_bytes([pe_header[4], pe_header[5]]);
    
    // 0x014c = IMAGE_FILE_MACHINE_I386 (32-bit)
    // 0x8664 = IMAGE_FILE_MACHINE_AMD64 (64-bit)
    Ok(machine == 0x014c)
}

#[cfg(not(windows))]
fn is_32bit_executable(_path: &std::path::Path) -> Result<bool, String> {
    Ok(false) // Non-Windows platforms don't have this issue
}

// Helper function to create a hidden command that doesn't flash a terminal window
fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    
    // On Windows, hide the terminal window to prevent flashing
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd
}

// Helper function to get the project root directory
fn get_project_root() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    if current_dir.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
        // If we're in src-tauri directory, go up one level to DevStackBox
        Ok(current_dir.parent().unwrap_or(&current_dir).to_path_buf())
    } else {
        // If we're already in DevStackBox or elsewhere, use current directory
        Ok(current_dir)
    }
}

// Helper function to get the installation base path
fn get_installation_path() -> PathBuf {
    // For development environment, check if we're in src-tauri
    if let Ok(current_dir) = env::current_dir() {
        let dir_name = current_dir.file_name().and_then(|name| name.to_str());
        
        // If in src-tauri, go up one level
        if dir_name == Some("src-tauri") {
            if let Some(parent) = current_dir.parent() {
                return parent.to_path_buf();
            }
        }
        
        // Check if current directory has the server components
        if current_dir.join("apache").join("bin").join("httpd.exe").exists() {
            println!("Found server components in current dir: {}", current_dir.display());
            return current_dir;
        }
    }
    
    // Try to get the path from the installed location
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            // Check if this directory actually has our server components
            if parent.join("apache").join("bin").join("httpd.exe").exists() {
                println!("Found server components at exe location: {}", parent.display());
                return parent.to_path_buf();
            }
            
            // Check if parent of parent has components (for installed apps)
            if let Some(grandparent) = parent.parent() {
                if grandparent.join("apache").join("bin").join("httpd.exe").exists() {
                    println!("Found server components at grandparent: {}", grandparent.display());
                    return grandparent.to_path_buf();
                }
            }
        }
    }
    
    // Try common installation paths in order of preference
    let possible_paths = [
        PathBuf::from("C:\\xampp\\htdocs\\DevStackBox"),
        PathBuf::from("C:\\dsb"),
        PathBuf::from("C:\\Program Files\\DevStackBox"),
        PathBuf::from("C:\\DevStackBox"),
    ];
    
    for path in &possible_paths {
        if path.join("apache").join("bin").join("httpd.exe").exists() {
            println!("Found server components at: {}", path.display());
            return path.clone();
        }
    }
    
    // Ultimate fallback to current directory
    let fallback = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    println!("Using fallback path: {}", fallback.display());
    fallback
}

// Service status and process tracking
static SERVICE_STATUS: LazyLock<Arc<Mutex<HashMap<String, bool>>>> = 
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

static SERVICE_PROCESSES: LazyLock<Arc<Mutex<HashMap<String, u32>>>> = 
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

#[derive(serde::Serialize)]
struct ServiceInfo {
    running: bool,
    pid: Option<u32>,
    port: Option<u16>,
    version: Option<String>,
}

#[derive(serde::Serialize)]
struct PHPVersionInfo {
    version: String,
    status: String, // "installed", "available", "downloading"
    path: String,
    is_active: bool,
    installed: bool,
    download_url: String,
}

#[tauri::command]
async fn check_binaries() -> Result<HashMap<String, bool>, String> {
    let mut binaries = HashMap::new();
    
    // Get the installation base path
    let base_path = get_installation_path();
    
    // Check MySQL
    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");
    binaries.insert("mysql".to_string(), mysql_path.exists());
    
    // Check Apache
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
    binaries.insert("apache".to_string(), apache_path.exists());
    
    // Check PHP 8.2
    let php_path = base_path.join("php").join("8.2").join("php.exe");
    binaries.insert("php8.2".to_string(), php_path.exists());
    
    Ok(binaries)
}

#[tauri::command]
async fn debug_paths() -> Result<HashMap<String, String>, String> {
    let mut paths = HashMap::new();
    
    // Get the installation base path
    let base_path = get_installation_path();
    
    paths.insert("current_dir".to_string(), env::current_dir().unwrap_or_default().display().to_string());
    paths.insert("base_path".to_string(), base_path.display().to_string());
    
    // Check MySQL
    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");
    paths.insert("mysql_path".to_string(), mysql_path.display().to_string());
    paths.insert("mysql_exists".to_string(), mysql_path.exists().to_string());
    
    // Check Apache
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
    paths.insert("apache_path".to_string(), apache_path.display().to_string());
    paths.insert("apache_exists".to_string(), apache_path.exists().to_string());
    
    // Check PHP 8.2
    let php_path = base_path.join("php").join("8.2").join("php.exe");
    paths.insert("php_path".to_string(), php_path.display().to_string());
    paths.insert("php_exists".to_string(), php_path.exists().to_string());
    
    Ok(paths)
}

#[tauri::command]
async fn debug_installation() -> Result<HashMap<String, String>, String> {
    let mut debug_info = HashMap::new();
    
    // Get current executable path
    if let Ok(exe_path) = env::current_exe() {
        debug_info.insert("exe_path".to_string(), exe_path.display().to_string());
        if let Some(parent) = exe_path.parent() {
            debug_info.insert("exe_parent".to_string(), parent.display().to_string());
        }
    }
    
    // Get installation path
    let install_path = get_installation_path();
    debug_info.insert("detected_install_path".to_string(), install_path.display().to_string());
    
    // Check if server components exist with detailed paths
    let apache_bin = install_path.join("apache").join("bin").join("httpd.exe");
    let mysql_bin = install_path.join("mysql").join("bin").join("mysqld.exe");
    let php_bin = install_path.join("php").join("8.2").join("php.exe");
    let phpmyadmin_index = install_path.join("phpmyadmin").join("index.php");
    
    debug_info.insert("apache_bin_path".to_string(), apache_bin.display().to_string());
    debug_info.insert("apache_exists".to_string(), apache_bin.exists().to_string());
    
    // Check Apache architecture if it exists
    if apache_bin.exists() {
        match is_32bit_executable(&apache_bin) {
            Ok(is_32bit) => {
                debug_info.insert("apache_32bit".to_string(), is_32bit.to_string());
                debug_info.insert("apache_architecture".to_string(), 
                    if is_32bit { "32-bit".to_string() } else { "64-bit".to_string() });
            },
            Err(e) => {
                debug_info.insert("apache_arch_error".to_string(), e);
            }
        }
    }
    
    // Check if config files exist and show their paths
    let config_dir = install_path.join("config");
    let httpd_conf = config_dir.join("httpd.conf");
    let phpmyadmin_conf = config_dir.join("phpmyadmin.conf");
    
    debug_info.insert("config_dir".to_string(), config_dir.display().to_string());
    debug_info.insert("httpd_conf_path".to_string(), httpd_conf.display().to_string());
    debug_info.insert("httpd_conf_exists".to_string(), httpd_conf.exists().to_string());
    debug_info.insert("phpmyadmin_conf_path".to_string(), phpmyadmin_conf.display().to_string());
    debug_info.insert("phpmyadmin_conf_exists".to_string(), phpmyadmin_conf.exists().to_string());
    
    debug_info.insert("mysql_bin_path".to_string(), mysql_bin.display().to_string());
    debug_info.insert("mysql_exists".to_string(), mysql_bin.exists().to_string());
    
    debug_info.insert("php_bin_path".to_string(), php_bin.display().to_string());
    debug_info.insert("php_exists".to_string(), php_bin.exists().to_string());
    
    debug_info.insert("phpmyadmin_path".to_string(), phpmyadmin_index.display().to_string());
    debug_info.insert("phpmyadmin_exists".to_string(), phpmyadmin_index.exists().to_string());
    
    // Check config files
    let apache_config = install_path.join("config").join("httpd.conf");
    let mysql_config = install_path.join("config").join("my.cnf");
    
    debug_info.insert("apache_config_path".to_string(), apache_config.display().to_string());
    debug_info.insert("apache_config_exists".to_string(), apache_config.exists().to_string());
    
    debug_info.insert("mysql_config_path".to_string(), mysql_config.display().to_string());
    debug_info.insert("mysql_config_exists".to_string(), mysql_config.exists().to_string());
    
    // Check permissions by trying to access directories
    let apache_dir_readable = install_path.join("apache").exists();
    let mysql_dir_readable = install_path.join("mysql").exists();
    
    debug_info.insert("apache_dir_readable".to_string(), apache_dir_readable.to_string());
    debug_info.insert("mysql_dir_readable".to_string(), mysql_dir_readable.to_string());
    
    // Check common installation paths
    let common_paths = [
        "C:\\dsb",
        "C:\\Program Files\\DevStackBox",
        "C:\\DevStackBox"
    ];
    
    for path in &common_paths {
        let path_buf = PathBuf::from(path);
        let exists = path_buf.exists();
        let apache_in_path = path_buf.join("apache").join("bin").join("httpd.exe").exists();
        debug_info.insert(
            format!("path_{}_status", path.replace("\\", "_").replace(":", "")),
            format!("dir_exists: {}, apache_exists: {}", exists, apache_in_path)
        );
    }
    
    // Check current working directory
    if let Ok(cwd) = env::current_dir() {
        debug_info.insert("current_working_dir".to_string(), cwd.display().to_string());
    }
    
    Ok(debug_info)
}

#[tauri::command]
async fn stop_all_services() -> Result<String, String> {
    let mut results = Vec::new();
    
    // Stop MySQL
    match stop_mysql().await {
        Ok(_) => results.push("MySQL stopped".to_string()),
        Err(e) => results.push(format!("MySQL stop failed: {}", e)),
    }
    
    // Stop Apache
    match stop_apache().await {
        Ok(_) => results.push("Apache stopped".to_string()),
        Err(e) => results.push(format!("Apache stop failed: {}", e)),
    }
    
    Ok(results.join("; "))
}

#[tauri::command]
async fn test_apache_config() -> Result<String, String> {
    let base_path = get_installation_path();
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
    let config_path = base_path.join("config").join("httpd.conf");
    
    if !apache_path.exists() {
        return Err(format!("Apache binary not found at: {}", apache_path.display()));
    }
    
    if !config_path.exists() {
        return Err(format!("Apache config not found at: {}", config_path.display()));
    }
    
    // Test Apache configuration
    let mut test_cmd = create_hidden_command(&apache_path.to_string_lossy());
    test_cmd.arg("-f")
        .arg(&config_path)
        .arg("-t")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    match test_cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            if output.status.success() {
                Ok(format!("Apache config test PASSED\nOutput: {}\nPath used: {}", stdout, apache_path.display()))
            } else {
                Err(format!("Apache config test FAILED\nError: {}\nOutput: {}\nPath used: {}", stderr, stdout, apache_path.display()))
            }
        }
        Err(e) => Err(format!("Failed to run Apache config test: {}\nPath: {}", e, apache_path.display())),
    }
}

#[tauri::command]
async fn get_mysql_status() -> Result<ServiceInfo, String> {
    // Check if MySQL is actually running by checking for mysqld.exe process
    let running = is_process_running("mysqld.exe");
    
    let pid = if running {
        get_process_pid("mysqld.exe")
    } else {
        None
    };

    // Update internal status to match reality
    if running {
        let mut status = SERVICE_STATUS.lock().map_err(|e| e.to_string())?;
        status.insert("mysql".to_string(), true);
    }

    Ok(ServiceInfo {
        running,
        pid,
        port: Some(3306),
        version: get_mysql_version().await,
    })
}

async fn initialize_mysql_data() -> Result<(), String> {
    let base_path = get_installation_path();
    
    let data_dir = base_path.join("mysql").join("data");
    let mysql_bin_path = base_path.join("mysql").join("bin").join("mysqld.exe");
    
    // Check if data directory is empty or missing mysql system tables
    let mysql_dir = data_dir.join("mysql");
    if !mysql_dir.exists() {
        // Initialize MySQL data directory
        match Command::new(&mysql_bin_path)
            .arg("--initialize-insecure")
            .arg(format!("--basedir={}", base_path.join("mysql").display()))
            .arg(format!("--datadir={}", data_dir.display()))
            .output()
        {
            Ok(_) => {
                println!("MySQL data directory initialized successfully");
                Ok(())
            }
            Err(e) => Err(format!("Failed to initialize MySQL data directory: {}", e))
        }
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn start_mysql() -> Result<bool, String> {
    // Get the installation base path
    let base_path = get_installation_path();
    
    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");
    if !mysql_path.exists() {
        return Err(format!("MySQL binary not found at {}. Please ensure MySQL is installed.", mysql_path.display()));
    }

    let config_path = base_path.join("config").join("my.cnf");
    if !config_path.exists() {
        create_default_mysql_config().await?;
    }

    // Initialize MySQL data directory if needed
    initialize_mysql_data().await?;

    match create_hidden_command(&mysql_path.to_string_lossy())
        .arg(format!("--defaults-file={}", config_path.display()))
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            println!("MySQL started with PID: {}", pid);
            
            // Wait a moment for MySQL to start
            sleep(Duration::from_secs(2)).await;
            
            // Verify MySQL is actually running by checking port 3306
            match std::process::Command::new("netstat")
                .arg("-ano")
                .output()
            {
                Ok(netstat_output) => {
                    let output_str = String::from_utf8_lossy(&netstat_output.stdout);
                    if output_str.contains(":3306 ") {
                        // Update service status
                        {
                            let mut status = SERVICE_STATUS.lock().map_err(|e| e.to_string())?;
                            status.insert("mysql".to_string(), true);
                        }
                        
                        // Store process PID
                        {
                            let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
                            processes.insert("mysql".to_string(), pid);
                        }
                        
                        Ok(true)
                    } else {
                        Err("MySQL started but port 3306 is not listening".to_string())
                    }
                }
                Err(_) => {
                    Err("Failed to verify MySQL is running".to_string())
                }
            }
        }
        Err(e) => Err(format!("Failed to start MySQL: {}", e)),
    }
}

#[tauri::command]
async fn stop_mysql() -> Result<bool, String> {
    // Check if MySQL is running
    if !is_process_running("mysqld.exe") {
        return Err("MySQL is not running".to_string());
    }

    // Kill the mysqld.exe process
    // Use regular Command, not create_hidden_command, for taskkill
    match Command::new("taskkill")
        .args(&["/F", "/IM", "mysqld.exe"])
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // Wait for process to terminate
            std::thread::sleep(Duration::from_millis(1000));
            
            // Verify process is actually gone
            if !is_process_running("mysqld.exe") {
                // Update service status
                {
                    let mut status = SERVICE_STATUS.lock().map_err(|e| e.to_string())?;
                    status.insert("mysql".to_string(), false);
                }
                
                // Remove from process tracking
                {
                    let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
                    processes.remove("mysql");
                }
                
                Ok(true)
            } else {
                Err(format!("MySQL process still running after kill attempt.\nOutput: {}\nError: {}", stdout, stderr))
            }
        }
        Err(e) => Err(format!("Failed to execute taskkill: {}", e)),
    }
}

async fn create_default_mysql_config() -> Result<(), String> {
    let base_path = get_project_root()?;
    
    let mysql_base = base_path.join("mysql");
    let mysql_data = base_path.join("mysql").join("data");
    
    let config_content = format!(r#"[mysqld]
port=3306
basedir={}
datadir={}
default-storage-engine=InnoDB
sql-mode="STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"
max_connections=100
table_open_cache=2000
tmp_table_size=16M
thread_cache_size=10
key_buffer_size=8M
sort_buffer_size=256K
skip-networking=false
bind-address=127.0.0.1

[mysql]
default-character-set=utf8mb4

[client]
port=3306
default-character-set=utf8mb4
"#, mysql_base.display().to_string().replace("\\", "/"), mysql_data.display().to_string().replace("\\", "/"));

    let config_dir = base_path.join("config");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join("my.cnf"), config_content).map_err(|e| e.to_string())?;
    Ok(())
}

async fn check_active_php_version(version: &str) -> bool {
    // Check if this version is currently active by checking the symlink
    let current_path = Path::new("php/current");
    if current_path.exists() {
        if let Ok(target) = std::fs::read_link(current_path) {
            if let Some(target_str) = target.to_str() {
                return target_str.contains(version);
            }
        }
    }
    false
}

async fn update_php_config(version: &str) -> Result<(), String> {
    // Update Apache config to use the new PHP version
    let apache_config_path = "config/httpd.conf";
    if Path::new(apache_config_path).exists() {
        let content = std::fs::read_to_string(apache_config_path).map_err(|e| e.to_string())?;
        let updated_content = content.replace(
            "php/php8apache2_4.dll",
            &format!("php/current/php{}apache2_4.dll", version.replace(".", ""))
        );
        std::fs::write(apache_config_path, updated_content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn get_mysql_version() -> Option<String> {
    let base_path = get_project_root().ok()?;
    let mysql_path = base_path.join("mysql").join("bin").join("mysqld.exe");
    
    if !mysql_path.exists() {
        return None;
    }

    match Command::new(&mysql_path)
        .arg("--version")
        .output()
    {
        Ok(output) => {
            let version_str = String::from_utf8_lossy(&output.stdout);
            // Extract version from output like "mysqld  Ver 8.0.35 for Win64 on x86_64"
            if let Some(start) = version_str.find("Ver ") {
                if let Some(end) = version_str[start + 4..].find(" ") {
                    return Some(version_str[start + 4..start + 4 + end].to_string());
                }
            }
            None
        }
        Err(_) => None,
    }
}

#[tauri::command]
async fn get_php_status() -> Result<ServiceInfo, String> {
    // PHP doesn't run as a service, so we check if it's available
    let version = get_current_php_version().await;
    
    Ok(ServiceInfo {
        running: version.is_some(),
        pid: None,
        port: None,
        version,
    })
}

async fn get_current_php_version() -> Option<String> {
    let php_path = Path::new("php/current/php.exe");
    if !php_path.exists() {
        // Check default PHP 8.2
        let default_php = Path::new("php/8.2/php.exe");
        if default_php.exists() {
            return Some("8.2".to_string());
        }
        return None;
    }

    // Get version from current PHP
    match Command::new("php/current/php.exe")
        .arg("--version")
        .output()
    {
        Ok(output) => {
            let version_str = String::from_utf8_lossy(&output.stdout);
            if let Some(start) = version_str.find("PHP ") {
                if let Some(end) = version_str[start + 4..].find(" ") {
                    return Some(version_str[start + 4..start + 4 + end].to_string());
                }
            }
            None
        }
        Err(_) => None,
    }
}

#[tauri::command]
async fn get_php_versions() -> Result<Vec<PHPVersionInfo>, String> {
    let mut versions = Vec::new();
    
    // Check for installed PHP versions
    for version in &["8.1", "8.2", "8.3", "8.4"] {
        let php_path = format!("php/{}/php.exe", version);
        let installed = Path::new(&php_path).exists();
        
        let active = if installed {
            check_active_php_version(version).await
        } else {
            false
        };

        versions.push(PHPVersionInfo {
            version: version.to_string(),
            status: if installed { "installed".to_string() } else { "available".to_string() },
            path: php_path,
            is_active: active,
            installed,
            download_url: format!("https://windows.php.net/downloads/releases/php-{}-Win32-vs16-x64.zip", version),
        });
    }
    
    Ok(versions)
}

#[tauri::command]
async fn switch_php_version(version: String) -> Result<bool, String> {
    let php_path = format!("php/{}/php.exe", version);
    if !Path::new(&php_path).exists() {
        return Err(format!("PHP {} is not installed", version));
    }

    // Create symlink or copy to main php directory
    let main_php_dir = Path::new("php/current");
    let version_php_dir = format!("php/{}", version);

    // Remove existing current directory
    if main_php_dir.exists() {
        std::fs::remove_dir_all(main_php_dir).map_err(|e| e.to_string())?;
    }

    // Create junction point on Windows (similar to symlink)
    match Command::new("mklink")
        .arg("/J")
        .arg("php\\current")
        .arg(&version_php_dir)
        .output()
    {
        Ok(_) => {
            // Update PHP configuration to point to current version
            update_php_config(&version).await?;
            Ok(true)
        }
        Err(e) => Err(format!("Failed to switch PHP version: {}", e)),
    }
}

#[tauri::command]
async fn download_php_version(version: String) -> Result<bool, String> {
    // This is a placeholder - in real implementation, you would:
    // 1. Download the PHP zip from the URL
    // 2. Extract it to php/{version}/ directory
    // 3. Configure it properly
    
    // For now, simulate download
    sleep(Duration::from_secs(3)).await;
    
    // Create directory structure
    let php_dir = format!("php/{}", version);
    std::fs::create_dir_all(&php_dir).map_err(|e| e.to_string())?;
    
    // Create a placeholder php.exe (in real implementation, this would be the actual binary)
    let php_exe = format!("{}/php.exe", php_dir);
    std::fs::write(&php_exe, "placeholder").map_err(|e| e.to_string())?;
    
    Ok(true)
}

// Helper function to check if a process is running
#[cfg(windows)]
fn is_process_running(process_name: &str) -> bool {
    match create_hidden_command("tasklist")
        .args(&["/FI", &format!("IMAGENAME eq {}", process_name)])
        .output()
    {
        Ok(output) => {
            let output_str = String::from_utf8_lossy(&output.stdout);
            output_str.contains(process_name)
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn is_process_running(process_name: &str) -> bool {
    match Command::new("pgrep")
        .arg(process_name)
        .output()
    {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

// Helper function to get process PID
#[cfg(windows)]
fn get_process_pid(process_name: &str) -> Option<u32> {
    match create_hidden_command("tasklist")
        .args(&["/FI", &format!("IMAGENAME eq {}", process_name), "/FO", "CSV", "/NH"])
        .output()
    {
        Ok(output) => {
            let output_str = String::from_utf8_lossy(&output.stdout);
            // Parse CSV format: "httpd.exe","1234","Console","1","12,345 K"
            for line in output_str.lines() {
                if line.contains(process_name) {
                    let parts: Vec<&str> = line.split(',').collect();
                    if parts.len() >= 2 {
                        let pid_str = parts[1].trim_matches('"').trim();
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            return Some(pid);
                        }
                    }
                }
            }
            None
        }
        Err(_) => None,
    }
}

#[cfg(not(windows))]
fn get_process_pid(process_name: &str) -> Option<u32> {
    match Command::new("pgrep")
        .arg(process_name)
        .output()
    {
        Ok(output) => {
            let output_str = String::from_utf8_lossy(&output.stdout);
            output_str.trim().parse::<u32>().ok()
        }
        Err(_) => None,
    }
}

#[tauri::command]
async fn get_apache_status() -> Result<ServiceInfo, String> {
    // Check if Apache is actually running by checking for httpd.exe process
    let running = is_process_running("httpd.exe");
    
    let pid = if running {
        get_process_pid("httpd.exe")
    } else {
        None
    };

    // Update internal status to match reality
    if running {
        let mut status = SERVICE_STATUS.lock().map_err(|e| e.to_string())?;
        status.insert("apache".to_string(), true);
    }

    Ok(ServiceInfo {
        running,
        pid,
        port: Some(80),
        version: get_apache_version().await,
    })
}

#[tauri::command]
async fn start_apache() -> Result<bool, String> {
    // Get the installation path (works for both dev and installed versions)
    let base_path = get_installation_path();
    
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
    if !apache_path.exists() {
        return Err(format!("Apache binary not found at {}. Please ensure Apache is installed.", apache_path.display()));
    }

    // Check if we're on 64-bit Windows and Apache is 32-bit
    #[cfg(target_arch = "x86_64")]
    {
        // For 64-bit builds, we need to ensure compatibility with 32-bit Apache
        if is_32bit_executable(&apache_path)? {
            return Err(format!(
                "❌ Architecture Mismatch Detected!\n\n\
                🔍 Issue: Your Apache is 32-bit, but DevStackBox is 64-bit\n\
                💡 Solution: Download 64-bit Apache from https://www.apachelounge.com/download/\n\
                📁 Look for: httpd-*-win64-VS17.zip\n\
                🔄 Replace: Extract Apache24 folder contents to your apache/ directory\n\n\
                Current Apache: {}", 
                apache_path.display()
            ));
        }
    }

    let config_path = base_path.join("config").join("httpd.conf");
    if !config_path.exists() {
        create_default_apache_config().await?;
    }

    // Change to base directory before starting Apache
    std::env::set_current_dir(&base_path).map_err(|e| e.to_string())?;

    // Test Apache configuration first
    match create_hidden_command(&apache_path.to_string_lossy())
        .arg("-f")
        .arg(&config_path)
        .arg("-t")
        .output()
    {
        Ok(output) => {
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Apache configuration test failed: {}", error));
            }
        }
        Err(e) => return Err(format!("Failed to test Apache configuration: {}", e)),
    }

    // Now try to start Apache
    match create_hidden_command(&apache_path.to_string_lossy())
        .arg("-f")
        .arg(&config_path)
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            println!("Apache started with PID: {}", pid);
            
            // Wait a moment for Apache to start
            sleep(Duration::from_secs(2)).await;
            
            // Verify Apache is actually running by checking port 80
            match create_hidden_command("netstat")
                .arg("-ano")
                .output()
            {
                Ok(netstat_output) => {
                    let output_str = String::from_utf8_lossy(&netstat_output.stdout);
                    if output_str.contains(":80 ") {
                        // Update service status
                        {
                            let mut status = SERVICE_STATUS.lock().map_err(|e| e.to_string())?;
                            status.insert("apache".to_string(), true);
                        }
                        
                        // Store process PID
                        {
                            let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
                            processes.insert("apache".to_string(), pid);
                        }
                        
                        Ok(true)
                    } else {
                        Err("Apache started but port 80 is not listening".to_string())
                    }
                }
                Err(_) => {
                    // If we can't verify, assume it started
                    {
                        let mut status = SERVICE_STATUS.lock().map_err(|e| e.to_string())?;
                        status.insert("apache".to_string(), true);
                    }
                    
                    {
                        let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
                        processes.insert("apache".to_string(), pid);
                    }
                    
                    Ok(true)
                }
            }
        }
        Err(e) => Err(format!("Failed to start Apache: {}", e)),
    }
}

#[tauri::command]
async fn stop_apache() -> Result<bool, String> {
    // Check if Apache is running
    if !is_process_running("httpd.exe") {
        return Err("Apache is not running".to_string());
    }

    // Kill all httpd.exe processes (Apache spawns multiple)
    // Use regular Command, not create_hidden_command, for taskkill
    match Command::new("taskkill")
        .args(&["/F", "/IM", "httpd.exe"])
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // Wait for processes to terminate
            std::thread::sleep(Duration::from_millis(1000));
            
            // Verify processes are actually gone
            if !is_process_running("httpd.exe") {
                // Update service status
                {
                    let mut status = SERVICE_STATUS.lock().map_err(|e| e.to_string())?;
                    status.insert("apache".to_string(), false);
                }
                
                // Remove from process tracking
                {
                    let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
                    processes.remove("apache");
                }
                
                Ok(true)
            } else {
                Err(format!("Apache processes still running after kill attempt.\nOutput: {}\nError: {}", stdout, stderr))
            }
        }
        Err(e) => Err(format!("Failed to execute taskkill: {}", e)),
    }
}

async fn create_default_apache_config() -> Result<(), String> {
    let base_path = get_installation_path(); // Use installation path instead of project root
    
    let apache_root = base_path.join("apache");
    let www_root = base_path.join("www");
    
    let config_content = format!(r#"# Apache Configuration for DevStackBox
ServerRoot "{}"
PidFile "{}/logs/httpd.pid"
Listen 80

# Essential modules
LoadModule dir_module modules/mod_dir.so
LoadModule mime_module modules/mod_mime.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule authz_host_module modules/mod_authz_host.so
LoadModule access_compat_module modules/mod_access_compat.so

ServerName localhost:80
DocumentRoot "{}"

<Directory "{}">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    DirectoryIndex index.html index.htm index.php
</Directory>

# MIME Types
TypesConfig conf/mime.types
AddType text/html .html .htm

# Error and Access logs
ErrorLog "{}/logs/error.log"
CustomLog "{}/logs/access.log" common

# Security
ServerTokens Prod
ServerSignature Off

# phpMyAdmin Configuration
Include "{}/config/phpmyadmin.conf"
"#, 
    apache_root.display().to_string().replace("\\", "/"),
    base_path.display().to_string().replace("\\", "/"),
    www_root.display().to_string().replace("\\", "/"),
    www_root.display().to_string().replace("\\", "/"),
    base_path.display().to_string().replace("\\", "/"),
    base_path.display().to_string().replace("\\", "/"),
    base_path.display().to_string().replace("\\", "/")
    );

    // Create phpMyAdmin configuration
    let phpmyadmin_config = format!(r#"# phpMyAdmin Virtual Host Configuration

# Create an alias for phpMyAdmin at /phpmyadmin
Alias /phpmyadmin "{}/phpmyadmin"

<Directory "{}/phpmyadmin">
    Options Indexes FollowSymLinks
    AllowOverride None
    DirectoryIndex index.php index.html
    Require ip 127.0.0.1
    Require ip ::1
    
    # Handle PHP files through CGI
    AddHandler php-script .php
    Action php-script /php/php-cgi.exe
    
    # Security rules
    <Files "*.php">
        SetHandler php-script
    </Files>
    
    <Files "config.inc.php">
        Require all denied
    </Files>
    
    <Files "setup.php">
        Require all denied
    </Files>
</Directory>

# Optional: Create a redirect from root to phpMyAdmin for testing
# Uncomment the next line if you want http://localhost/ to redirect to phpMyAdmin
# Redirect /index.html /phpmyadmin/

# Alias for easy access
Alias /pma "{}/phpmyadmin"
"#,
    base_path.display().to_string().replace("\\", "/"),
    base_path.display().to_string().replace("\\", "/"),
    base_path.display().to_string().replace("\\", "/")
    );

    let config_dir = base_path.join("config");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join("httpd.conf"), config_content).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join("phpmyadmin.conf"), phpmyadmin_config).map_err(|e| e.to_string())?;
    
    Ok(())
}

async fn get_apache_version() -> Option<String> {
    let base_path = get_installation_path();
    let apache_path = base_path.join("apache").join("bin").join("httpd.exe");
    
    if !apache_path.exists() {
        return None;
    }

    match create_hidden_command(apache_path.to_str()?)
        .arg("-v")
        .output()
    {
        Ok(output) => {
            let version_str = String::from_utf8_lossy(&output.stdout);
            // Look for "Apache/2.4.62" pattern
            if let Some(start) = version_str.find("Apache/") {
                if let Some(end) = version_str[start + 7..].find(" ") {
                    let version = version_str[start + 7..start + 7 + end].to_string();
                    return Some(version);
                }
            }
            None
        }
        Err(e) => {
            println!("Failed to get Apache version: {}", e);
            None
        }
    }
}

// Toggle functions for frontend compatibility
#[tauri::command]
async fn toggle_mysql() -> Result<bool, String> {
    let status = get_mysql_status().await?;
    if status.running {
        stop_mysql().await?;
        Ok(false)
    } else {
        start_mysql().await?;
        Ok(true)
    }
}

#[tauri::command]
async fn toggle_apache() -> Result<bool, String> {
    let status = get_apache_status().await?;
    if status.running {
        stop_apache().await?;
        Ok(false)
    } else {
        start_apache().await?;
        Ok(true)
    }
}

#[tauri::command]
async fn toggle_php() -> Result<bool, String> {
    // PHP doesn't start/stop like a service, just return a status
    Ok(true)
}

#[tauri::command]
async fn get_service_logs(service: String) -> Result<String, String> {
    Ok(format!("Logs for {} service:\n\nService started successfully\nNo errors reported\n\n[This is a placeholder log]", service))
}

#[tauri::command]
async fn create_directory_structure() -> Result<String, String> {
    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    let base_path = current_dir.parent().unwrap_or(&current_dir);
    
    let directories = [
        "mysql/bin",
        "mysql/data", 
        "php/8.2",
        "apache/bin",
        "apache/conf",
        "phpmyadmin",
        "apps",
        "config",
        "config-backups",
        "logs",
        "www"
    ];

    for dir in directories.iter() {
        let full_path = base_path.join(dir);
        if let Err(e) = std::fs::create_dir_all(&full_path) {
            return Err(format!("Failed to create directory {}: {}", full_path.display(), e));
        }
    }

    // Define www path for creating web files
    let www_path = base_path.join("www");

    // Create default index.php file
    let index_php_content = "<?php
// DevStackBox - PHP Development Environment
?>
<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>DevStackBox - PHP Development Environment</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f4f4f4; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .status { background: #e8f5e8; padding: 15px; border-left: 4px solid #4caf50; margin: 20px 0; }
        .info-box { background: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3; margin: 20px 0; }
        .links { margin-top: 30px; }
        .links a { display: inline-block; margin: 10px 15px 10px 0; padding: 10px 20px; background: #007cba; color: white; text-decoration: none; border-radius: 4px; }
        .links a:hover { background: #005a87; }
        .info { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class=\"container\">
        <h1>DevStackBox - PHP Development Environment</h1>
        
        <div class=\"status\">
            <strong>PHP is working!</strong><br>
            Your development environment is ready.
        </div>

        <div class=\"info-box\">
            <h3>Current Configuration:</h3>
            <table>
                <tr><th>Component</th><th>Status</th><th>Version</th></tr>
                <tr><td>PHP</td><td>Running</td><td><?php echo PHP_VERSION; ?></td></tr>
                <tr><td>Apache</td><td>Running</td><td><?php echo $_SERVER['SERVER_SOFTWARE'] ?? 'Apache HTTP Server'; ?></td></tr>
                <tr><td>Server Time</td><td>Active</td><td><?php echo date('Y-m-d H:i:s'); ?></td></tr>
                <tr><td>Document Root</td><td>Active</td><td><?php echo $_SERVER['DOCUMENT_ROOT']; ?></td></tr>
            </table>
        </div>

        <div class=\"links\">
            <a href=\"phpinfo.php\">PHP Info</a>
            <a href=\"../phpmyadmin/\" target=\"_blank\">phpMyAdmin</a>
            <a href=\"test.html\">Test Page</a>
        </div>

        <div class=\"info\">
            <h3>Quick Start:</h3>
            <ul>
                <li>Place your PHP files in the <code>www/</code> directory</li>
                <li>Access them via <a href=\"http://localhost/\">http://localhost/</a></li>
                <li>MySQL is available on port 3306</li>
                <li>Use phpMyAdmin for database management</li>
            </ul>
        </div>

        <div style=\"margin-top: 30px; color: #666; border-top: 1px solid #eee; padding-top: 20px;\">
            <small>DevStackBox - Portable PHP Development Environment<br>
            Access this page at: <a href=\"http://localhost\">http://localhost</a></small>
        </div>
    </div>
</body>
</html>";

    std::fs::write(www_path.join("index.php"), index_php_content).map_err(|e| e.to_string())?;

    // Create phpinfo.php file
    let phpinfo_content = "<?php
// DevStackBox - PHP Information Page
?>
<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>PHP Info - DevStackBox</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f4; }
        .header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .back-link { display: inline-block; margin-bottom: 15px; padding: 8px 16px; background: #007cba; color: white; text-decoration: none; border-radius: 4px; }
        .back-link:hover { background: #005a87; }
    </style>
</head>
<body>
    <div class=\"header\">
        <a href=\"index.php\" class=\"back-link\">← Back to Home</a>
        <h1>PHP Configuration Information</h1>
        <p>Complete PHP configuration for your DevStackBox environment</p>
    </div>
    
    <?php 
    // Display full PHP configuration
    phpinfo(); 
    ?>
</body>
</html>";

    std::fs::write(www_path.join("phpinfo.php"), phpinfo_content).map_err(|e| e.to_string())?;

    // Create default index.html file (fallback)
    let index_html_content = "<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>DevStackBox - PHP Development Environment</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f4f4f4; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .status { background: #e8f5e8; padding: 15px; border-left: 4px solid #4caf50; margin: 20px 0; }
        .warning { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        .links { margin-top: 30px; }
        .links a { display: inline-block; margin: 10px 15px 10px 0; padding: 10px 20px; background: #007cba; color: white; text-decoration: none; border-radius: 4px; }
        .links a:hover { background: #005a87; }
        .info { margin-top: 20px; }
    </style>
</head>
<body>
    <div class=\"container\">
        <h1>DevStackBox - PHP Development Environment</h1>
        
        <div class=\"status\">
            <strong>Apache Web Server is running!</strong><br>
            Welcome to your local development environment.
        </div>

        <div class=\"warning\">
            <strong>PHP Support:</strong> PHP module will be configured in the next update.<br>
            For now, Apache is serving static HTML files.
        </div>

        <div class=\"links\">
            <a href=\"#\" title=\"PHP support coming soon\">PHP Info (Coming Soon)</a>
            <a href=\"../phpmyadmin/\" target=\"_blank\">phpMyAdmin</a>
            <a href=\"test.html\">Test Page</a>
        </div>

        <div class=\"info\">
            <h3>Environment Details:</h3>
            <ul>
                <li><strong>Web Server:</strong> Apache HTTP Server</li>
                <li><strong>Document Root:</strong> www/</li>
                <li><strong>Status:</strong> Apache Running</li>
                <li><strong>MySQL:</strong> Available (start from DevStackBox app)</li>
                <li><strong>PHP:</strong> Available (module integration pending)</li>
            </ul>
        </div>

        <div style=\"margin-top: 30px; color: #666; border-top: 1px solid #eee; padding-top: 20px;\">
            <small>DevStackBox - Portable PHP Development Environment<br>
            Access this page at: <a href=\"http://localhost\">http://localhost</a></small>
        </div>
    </div>
</body>
</html>";

    let www_path = base_path.join("www");
    std::fs::write(www_path.join("index.html"), index_html_content).map_err(|e| e.to_string())?;

    // Create test.html
    let test_html_content = "<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>Test Page - DevStackBox</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f4f4f4; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 4px; }
        .success { background: #e8f5e8; border-color: #4caf50; }
        .info { background: #e3f2fd; border-color: #2196f3; }
        .back-link { display: inline-block; margin-bottom: 20px; padding: 8px 16px; background: #007cba; color: white; text-decoration: none; border-radius: 4px; }
        .back-link:hover { background: #005a87; }
    </style>
</head>
<body>
    <div class=\"container\">
        <a href=\"index.html\" class=\"back-link\">Back to Home</a>
        
        <h1>DevStackBox Test Page</h1>
        
        <div class=\"test-section success\">
            <h3>Apache is working!</h3>
            <p>This page is being served by Apache HTTP Server</p>
            <p>Current URL: <span id=\"current-url\"></span></p>
        </div>

        <div class=\"test-section info\">
            <h3>Browser Information</h3>
            <p>User Agent: <span id=\"user-agent\"></span></p>
            <p>Screen Resolution: <span id=\"screen-res\"></span></p>
            <p>Language: <span id=\"language\"></span></p>
        </div>

        <div class=\"test-section info\">
            <h3>Connection Test</h3>
            <p>Server: Apache HTTP Server</p>
            <p>Protocol: HTTP/1.1</p>
            <p>Port: 80</p>
        </div>

        <script>
            document.getElementById('current-url').textContent = window.location.href;
            document.getElementById('user-agent').textContent = navigator.userAgent;
            document.getElementById('screen-res').textContent = screen.width + 'x' + screen.height;
            document.getElementById('language').textContent = navigator.language;
        </script>
    </div>
</body>
</html>";

    std::fs::write(www_path.join("test.html"), test_html_content).map_err(|e| e.to_string())?;

    Ok("Directory structure and default web files created successfully".to_string())
}

// System Tray Commands
#[tauri::command]
async fn show_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_to_tray(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn quit_app(app_handle: tauri::AppHandle) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("Starting DevStackBox application...");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_binaries,
            debug_paths,
            debug_installation,
            stop_all_services,
            test_apache_config,
            get_mysql_status,
            get_php_status, 
            get_apache_status,
            start_mysql,
            stop_mysql,
            start_apache,
            stop_apache,
            get_php_versions,
            switch_php_version,
            download_php_version,
            toggle_mysql,
            toggle_php,
            toggle_apache,
            get_service_logs,
            create_directory_structure,
            show_main_window,
            hide_to_tray,
            quit_app
        ])
        .setup(|app| {
            println!("DevStackBox setup complete, setting up system tray...");
            
            // Create system tray menu
            let show_item = MenuItemBuilder::new("Show DevStackBox").id("show").build(app)?;
            let hide_item = MenuItemBuilder::new("Hide to Tray").id("hide").build(app)?;
            let mysql_item = MenuItemBuilder::new("Toggle MySQL").id("mysql").build(app)?;
            let apache_item = MenuItemBuilder::new("Toggle Apache").id("apache").build(app)?;
            let quit_item = MenuItemBuilder::new("Quit").id("quit").build(app)?;
            
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&mysql_item)
                .item(&apache_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Create system tray
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("DevStackBox - PHP Development Environment")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(move |_app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = _app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = _app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "mysql" => {
                            // Toggle MySQL service
                            println!("Toggle MySQL from tray");
                        }
                        "apache" => {
                            // Toggle Apache service  
                            println!("Toggle Apache from tray");
                        }
                        "quit" => {
                            _app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click { button, .. } => {
                            if button == tauri::tray::MouseButton::Left {
                                // Left click to show/hide main window
                                let app = tray.app_handle();
                                if let Some(window) = app.get_webview_window("main") {
                                    if window.is_visible().unwrap_or(false) {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            println!("System tray initialized successfully!");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
