// Embedded terminal session management.
//
// Spawns a cmd.exe child process per session inside a ConPTY (via portable-pty),
// and streams output to the frontend via Tauri events.
//
// Event emitted:  "terminal-output"  payload: { session_id: String, data: String }

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};

use crate::utils::paths::{get_installation_path, get_mysql_bin_dir};

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
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

// ── helpers ───────────────────────────────────────────────────────────────────

/// Emit a chunk of terminal output to the frontend.
fn emit_output(app: &AppHandle, session_id: &str, data: &str) {
    let _ = app.emit(
        "terminal-output",
        serde_json::json!({ "session_id": session_id, "data": data }),
    );
}

/// Read PTY output in a background thread and batch-emits to the frontend.
fn spawn_pty_output_forwarder(
    app: AppHandle,
    session_id: String,
    reader: Box<dyn Read + Send>,
) {
    use std::sync::mpsc;
    use std::time::Duration;

    let (tx, rx) = mpsc::channel::<String>();

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut reader = reader;
        while let Ok(n @ 1..) = reader.read(&mut buf) {
            let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
            if tx.send(chunk).is_err() {
                break;
            }
        }
    });

    std::thread::spawn(move || {
        let window = Duration::from_millis(16);
        while let Ok(first) = rx.recv() {
            let mut batch = first;
            while let Ok(chunk) = rx.recv_timeout(window) {
                batch.push_str(&chunk);
            }
            emit_output(&app, &session_id, &batch);
        }
        emit_output(&app, &session_id, "\r\n[session closed]\r\n");
    });
}

fn build_shell_path(base_path: &PathBuf) -> String {
    let php_path = base_path.join("php").join("current");
    let mysql_bin = get_mysql_bin_dir(base_path);
    let existing_path = std::env::var("PATH").unwrap_or_default();
    format!(
        "{};{};{}",
        php_path.display(),
        mysql_bin.display(),
        existing_path
    )
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
    let new_path = build_shell_path(&base_path);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new("cmd.exe");
    cmd.env("PATH", &new_path);
    if let Some(cwd) = base_path.to_str() {
        cmd.cwd(cwd);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
    let mut writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    spawn_pty_output_forwarder(app.clone(), session_id.clone(), reader);

    if let Some(cmd) = initial_command {
        let line = format!("{}\r\n", cmd);
        writer
            .write_all(line.as_bytes())
            .map_err(|e| format!("Failed to write initial command: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush initial command: {}", e))?;
    }

    let session = TerminalSession {
        writer,
        master: pair.master,
        child,
    };

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

    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Terminal session not found: {}", session_id))?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn resize_terminal(
    state: tauri::State<'_, Arc<TerminalSessions>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .inner
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?;

    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Terminal session not found: {}", session_id))?;

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;

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
