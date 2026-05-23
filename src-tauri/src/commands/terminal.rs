// Embedded terminal session management.
//
// Spawns a cmd.exe child process per session, pipes stdin/stdout/stderr,
// and streams output to the frontend via Tauri events.
//
// Event emitted:  "terminal-output"  payload: { session_id: String, data: String }

use std::collections::HashMap;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::utils::paths::get_installation_path;

// ── shared state ─────────────────────────────────────────────────────────────

pub struct TerminalSessions {
    pub inner: Mutex<HashMap<String, TerminalSession>>,
}

impl TerminalSessions {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for TerminalSessions {
    fn default() -> Self {
        Self::new()
    }
}

pub struct TerminalSession {
    stdin: ChildStdin,
    child: Child,
}

// ── helpers ───────────────────────────────────────────────────────────────────

/// Emit a chunk of terminal output to the frontend.
fn emit_output(app: &AppHandle, session_id: &str, data: &str) {
    let _ = app.emit(
        "terminal-output",
        serde_json::json!({ "session_id": session_id, "data": data }),
    );
}

/// Read bytes from a readable and emit them line-by-line as events.
fn stream_reader<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    session_id: String,
    mut reader: R,
) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 512];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    emit_output(&app, &session_id, &chunk);
                }
                Err(_) => break,
            }
        }
        // Signal session end.
        emit_output(&app, &session_id, "\r\n[session closed]\r\n");
    });
}

// ── commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    state: tauri::State<'_, Arc<TerminalSessions>>,
    session_id: String,
    initial_command: Option<String>,
) -> Result<(), String> {
    let base_path = get_installation_path();

    // Build PATH that includes php/current and mysql/bin so CLI tools work.
    let php_path = base_path.join("php").join("current");
    let mysql_bin = base_path.join("mysql").join("bin");
    let existing_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!(
        "{};{};{}",
        php_path.display(),
        mysql_bin.display(),
        existing_path
    );

    let mut child = std::process::Command::new("cmd.exe")
        .env("PATH", &new_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let stdin = child.stdin.take().unwrap();

    // Stream stdout and stderr to frontend.
    stream_reader(app.clone(), session_id.clone(), stdout);
    stream_reader(app.clone(), session_id.clone(), stderr);

    // Optionally send an initial command (e.g. "mysql -u root").
    let mut session = TerminalSession { stdin, child };
    if let Some(cmd) = initial_command {
        let line = format!("{}\r\n", cmd);
        let _ = session.stdin.write_all(line.as_bytes());
    }

    let mut sessions = state
        .inner
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?;
    sessions.insert(session_id, session);

    Ok(())
}

#[tauri::command]
pub async fn send_terminal_input(
    state: tauri::State<'_, Arc<TerminalSessions>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state
        .inner
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?;

    if let Some(session) = sessions.get_mut(&session_id) {
        session
            .stdin
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        session
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn kill_terminal_session(
    state: tauri::State<'_, Arc<TerminalSessions>>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .inner
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?;

    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
    }

    Ok(())
}
