// Process and executable utilities.

use std::process::Command;

// Returns true if the given .exe is 32-bit (PE header IMAGE_FILE_MACHINE_I386).
#[cfg(windows)]
pub fn is_32bit_executable(path: &std::path::Path) -> Result<bool, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};

    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;

    let mut dos_header = [0u8; 64];
    file.read_exact(&mut dos_header).map_err(|e| format!("Failed to read DOS header: {e}"))?;

    if &dos_header[0..2] != b"MZ" {
        return Err("Invalid DOS signature".to_string());
    }

    let pe_offset = u32::from_le_bytes([dos_header[60], dos_header[61], dos_header[62], dos_header[63]]);

    file.seek(SeekFrom::Start(pe_offset as u64)).map_err(|e| format!("Failed to seek to PE header: {e}"))?;

    let mut pe_header = [0u8; 24];
    file.read_exact(&mut pe_header).map_err(|e| format!("Failed to read PE header: {e}"))?;

    if &pe_header[0..4] != b"PE\0\0" {
        return Err("Invalid PE signature".to_string());
    }

    let machine = u16::from_le_bytes([pe_header[4], pe_header[5]]);

    // 0x014c = IMAGE_FILE_MACHINE_I386 (32-bit)
    // 0x8664 = IMAGE_FILE_MACHINE_AMD64 (64-bit)
    Ok(machine == 0x014c)
}

#[cfg(not(windows))]
pub fn is_32bit_executable(_path: &std::path::Path) -> Result<bool, String> {
    Ok(false)
}

// Creates a Command that does not flash a terminal window on Windows.
pub fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd
}

#[cfg(windows)]
pub fn is_process_running(process_name: &str) -> bool {
    match create_hidden_command("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {}", process_name), "/NH"])
        .output()
    {
        Ok(output) => {
            let output_str = String::from_utf8_lossy(&output.stdout);
            output_str.contains(process_name)
                && !output_str.contains("INFO:")
                && !output_str.contains("No tasks")
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
pub fn is_process_running(process_name: &str) -> bool {
    match Command::new("pgrep")
        .arg(process_name)
        .output()
    {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[cfg(windows)]
pub fn get_process_pid(process_name: &str) -> Option<u32> {
    match create_hidden_command("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {}", process_name), "/FO", "CSV", "/NH"])
        .output()
    {
        Ok(output) => {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                if line.contains(process_name) && !line.contains("INFO:") && !line.contains("No tasks") {
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
pub fn get_process_pid(process_name: &str) -> Option<u32> {
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

// =====================================================================
// Path-aware process lookup
//
// `is_process_running` and `get_process_pid` above match by image name only.
// That is unsafe on a developer machine because XAMPP, WAMP, MAMP, Laragon,
// or a manual Apache install can have their own `httpd.exe` / `mysqld.exe`
// running. We must only consider a service "ours" when its executable lives
// under the DevStackBox installation dir, otherwise Start refuses to run and
// Stop kills the wrong process.
//
// On Windows we use PowerShell + Win32_Process so we get the full
// `ExecutablePath`. PowerShell is on every supported Windows version (unlike
// `wmic` which is deprecated and missing on newer Windows 11 builds).
// =====================================================================

#[cfg(windows)]
pub fn find_processes_by_image(process_name: &str) -> Vec<(u32, std::path::PathBuf)> {
    // Sanitize: only allow simple filenames, never anything that could break
    // out of the single-quoted PowerShell filter string.
    if process_name.is_empty()
        || process_name
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && c != '.' && c != '_' && c != '-')
    {
        return Vec::new();
    }

    let script = format!(
        "Get-CimInstance Win32_Process -Filter \"Name='{}'\" | \
         ForEach-Object {{ \"$($_.ProcessId)|$($_.ExecutablePath)\" }}",
        process_name
    );

    let output = match create_hidden_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
    {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, '|');
        let pid_str = parts.next().unwrap_or("").trim();
        let path_str = parts.next().unwrap_or("").trim();
        if let Ok(pid) = pid_str.parse::<u32>() {
            results.push((pid, std::path::PathBuf::from(path_str)));
        }
    }
    results
}

#[cfg(not(windows))]
pub fn find_processes_by_image(_process_name: &str) -> Vec<(u32, std::path::PathBuf)> {
    Vec::new()
}

// Returns true only for processes whose ExecutablePath equals (case-insensitively
// on Windows) the path we expect. This is the canonical "is OUR service running?"
// check.
pub fn is_our_process_running(process_name: &str, expected_path: &std::path::Path) -> bool {
    !find_our_processes(process_name, expected_path).is_empty()
}

// Returns the PIDs of processes whose ExecutablePath matches `expected_path`.
pub fn find_our_processes(process_name: &str, expected_path: &std::path::Path) -> Vec<u32> {
    let expected = normalize_path(expected_path);
    find_processes_by_image(process_name)
        .into_iter()
        .filter_map(|(pid, p)| {
            if normalize_path(&p) == expected {
                Some(pid)
            } else {
                None
            }
        })
        .collect()
}

fn normalize_path(p: &std::path::Path) -> String {
    // Canonicalize when possible so junctions / different casings collapse;
    // fall back to the raw path lowercased.
    let raw = std::fs::canonicalize(p)
        .map(|c| c.to_string_lossy().into_owned())
        .unwrap_or_else(|_| p.to_string_lossy().into_owned());
    let stripped = raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string();
    if cfg!(windows) {
        stripped.to_lowercase()
    } else {
        stripped
    }
}

// Kills a single PID. Used instead of `taskkill /IM <name>` so we do not
// touch processes belonging to other stacks (XAMPP, WAMP, etc.).
#[cfg(windows)]
pub fn kill_pid(pid: u32) -> Result<(), String> {
    let output = create_hidden_command("taskkill")
        .args(["/F", "/PID", &pid.to_string(), "/T"])
        .output()
        .map_err(|e| format!("Failed to execute taskkill: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "taskkill failed for pid {}: {}",
            pid,
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[cfg(not(windows))]
pub fn kill_pid(pid: u32) -> Result<(), String> {
    let output = Command::new("kill")
        .args(["-9", &pid.to_string()])
        .output()
        .map_err(|e| format!("Failed to execute kill: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "kill failed for pid {}: {}",
            pid,
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

// Phase 5.2 - port conflict detection.
//
// Returns Ok(()) if `port` on 127.0.0.1 is free; otherwise returns a
// human-readable error mentioning the service name. We attempt to bind a
// TCP listener; if the bind fails, the port is considered busy.
pub fn ensure_port_available(port: u16, service: &str) -> Result<(), String> {
    use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};

    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    match TcpListener::bind(addr) {
        Ok(listener) => {
            // Release the port immediately so the real service can grab it.
            drop(listener);
            Ok(())
        }
        Err(e) => Err(format!(
            "Port {port} is already in use, so {service} cannot start. \
             Close the program holding that port (often IIS, Skype, another \
             web server, or a previous DevStackBox instance) and try again. \
             Underlying error: {e}"
        )),
    }
}
