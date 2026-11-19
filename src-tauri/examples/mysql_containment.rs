//! Disposable process-boundary probe. No production test hooks or hidden IPC.
use devstackbox_lib::{
    commands::mysql_import::MYSQL_DATA_LOCK,
    utils::{
        database_io::wait_bounded,
        mysql_connection::mysql_command,
        mysql_process::{Command, Stdio},
    },
};
use std::{io::Write, time::Duration};
fn emit(value: serde_json::Value) {
    println!("{value}");
    std::io::stdout().flush().unwrap();
}
fn main() {
    let install = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();
    let profile = std::path::PathBuf::from(std::env::var_os("DEVSTACKBOX_DATA_DIR").unwrap());
    assert!(
        install.join("qualification.marker").exists()
            && profile.join("qualification.marker").exists()
    );
    let case = std::env::var("CONTAINMENT_CASE").unwrap();
    if case == "nested" {
        let output = Command::new(std::env::current_exe().unwrap())
            .env("CONTAINMENT_CASE", "error")
            .output()
            .unwrap();
        assert!(output.status.success());
        emit(
            serde_json::json!({"case":"nested", "parent":std::process::id(), "inner":String::from_utf8_lossy(&output.stdout)}),
        );
        return;
    }
    let guard = MYSQL_DATA_LOCK.try_lock().unwrap();
    emit(serde_json::json!({"phase":"before_spawn","parent":std::process::id()}));
    if case == "before_spawn" {
        std::thread::sleep(Duration::from_secs(60));
    }
    let mut command = mysql_command().unwrap();
    command
        .args(["--batch", "--binary-mode"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().unwrap();
    let pid = child.id();
    emit(serde_json::json!({"phase":"before_stream", "parent":std::process::id(),"child":pid}));
    if case == "before_stream" {
        std::thread::sleep(Duration::from_secs(60));
    }
    let sql = match case.as_str() {
        "error" => "INVALID SYNTHETIC SQL;",
        "complete" => "UPDATE qual.sentinel SET value='complete';",
        _ => "UPDATE qual.sentinel SET value='partial'; SELECT SLEEP(12); UPDATE qual.sentinel SET value='late';",
    };
    child
        .stdin
        .take()
        .unwrap()
        .write_all(sql.as_bytes())
        .unwrap();
    emit(serde_json::json!({"phase":"streamed", "parent":std::process::id(),"child":pid}));
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    if case == "cancel" {
        let flag = cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(2));
            flag.store(true, std::sync::atomic::Ordering::Release);
        });
    }
    let result = wait_bounded(
        child,
        Duration::from_secs(if case == "timeout" { 2 } else { 45 }),
        65536,
        Some(&cancel),
    );
    drop(guard);
    let lock_released = MYSQL_DATA_LOCK.try_lock().is_ok();
    emit(
        serde_json::json!({"phase":"completed","parent":std::process::id(),"child":pid,"lock_released":lock_released,"result":result.as_ref().map(|v|v.status.code()).map_err(|e|e.as_str())}),
    );
    assert!(lock_released);
    if case == "complete" {
        std::thread::sleep(Duration::from_secs(60));
    }
}
