use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{LazyLock, Mutex};
use tokio::time::{sleep, Duration};

// Global service process tracker
static SERVICE_PROCESSES: LazyLock<Mutex<HashMap<String, u32>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

pub struct ServiceManager;

impl ServiceManager {
    // Start Apache with proper process management
    pub async fn start_apache(apache_path: &std::path::Path, config_path: &std::path::Path) -> Result<bool, String> {
        // Stop any existing Apache process first
        Self::stop_service("apache").await?;

        // Create the command with hidden window to prevent terminal flashing
        let mut cmd = Command::new(apache_path);
        cmd.arg("-f")
           .arg(config_path)
           .arg("-D")
           .arg("FOREGROUND")
           .stdout(Stdio::null())  // Hide output
           .stderr(Stdio::null())  // Hide errors
           .stdin(Stdio::null());  // Hide input

        // On Windows, create process with hidden window
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match cmd.spawn() {
            Ok(child) => {
                let pid = child.id();
                
                // Store the process ID
                {
                    let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
                    processes.insert("apache".to_string(), pid);
                }

                // Wait for service to start
                sleep(Duration::from_secs(3)).await;

                // Verify Apache is running by checking port 80
                if Self::is_port_listening(80).await {
                    Ok(true)
                } else {
                    Err("Apache started but not listening on port 80".to_string())
                }
            }
            Err(e) => Err(format!("Failed to start Apache: {}", e)),
        }
    }

    // Start MySQL with proper process management
    pub async fn start_mysql(mysql_path: &std::path::Path, config_path: &std::path::Path) -> Result<bool, String> {
        // Stop any existing MySQL process first
        Self::stop_service("mysql").await?;

        // Create the command with hidden window to prevent terminal flashing
        let mut cmd = Command::new(mysql_path);
        cmd.arg(format!("--defaults-file={}", config_path.display()))
           .arg("--console")
           .stdout(Stdio::null())  // Hide output
           .stderr(Stdio::null())  // Hide errors
           .stdin(Stdio::null());  // Hide input

        // On Windows, create process with hidden window
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match cmd.spawn() {
            Ok(child) => {
                let pid = child.id();
                
                // Store the process ID
                {
                    let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
                    processes.insert("mysql".to_string(), pid);
                }

                // Wait for service to start
                sleep(Duration::from_secs(5)).await;

                // Verify MySQL is running by checking port 3306
                if Self::is_port_listening(3306).await {
                    Ok(true)
                } else {
                    Err("MySQL started but not listening on port 3306".to_string())
                }
            }
            Err(e) => Err(format!("Failed to start MySQL: {}", e)),
        }
    }

    // Stop a service by name
    pub async fn stop_service(service_name: &str) -> Result<(), String> {
        let pid = {
            let mut processes = SERVICE_PROCESSES.lock().map_err(|e| e.to_string())?;
            processes.remove(service_name)
        };

        if let Some(pid) = pid {
            // Kill the process on Windows
            #[cfg(windows)]
            {
                let mut cmd = Command::new("taskkill");
                cmd.arg("/F")
                   .arg("/PID")
                   .arg(pid.to_string())
                   .stdout(Stdio::null())
                   .stderr(Stdio::null());

                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }

                let _ = cmd.output(); // Ignore errors
            }

            #[cfg(not(windows))]
            {
                let mut cmd = Command::new("kill");
                cmd.arg("-9")
                   .arg(pid.to_string())
                   .stdout(Stdio::null())
                   .stderr(Stdio::null());

                let _ = cmd.output(); // Ignore errors
            }
        }

        Ok(())
    }

    // Check if a port is listening
    async fn is_port_listening(port: u16) -> bool {
        // Use netstat with hidden window
        let mut cmd = Command::new("netstat");
        cmd.arg("-ano")
           .stdout(Stdio::piped())
           .stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match cmd.output() {
            Ok(output) => {
                let output_str = String::from_utf8_lossy(&output.stdout);
                output_str.contains(&format!(":{} ", port))
            }
            Err(_) => false,
        }
    }

    // Stop all managed services
    pub async fn stop_all() -> Result<String, String> {
        let mut results = Vec::new();

        // Stop MySQL
        match Self::stop_service("mysql").await {
            Ok(_) => results.push("MySQL stopped".to_string()),
            Err(e) => results.push(format!("MySQL stop failed: {}", e)),
        }

        // Stop Apache
        match Self::stop_service("apache").await {
            Ok(_) => results.push("Apache stopped".to_string()),
            Err(e) => results.push(format!("Apache stop failed: {}", e)),
        }

        Ok(results.join("; "))
    }

    // Get service status
    pub fn get_service_status(service_name: &str) -> bool {
        let processes = SERVICE_PROCESSES.lock().unwrap_or_else(|e| e.into_inner());
        processes.contains_key(service_name)
    }
}
