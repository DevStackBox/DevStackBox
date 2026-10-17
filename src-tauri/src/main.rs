// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--stop-services") {
        let result = tauri::async_runtime::block_on(devstackbox_lib::commands::system::stop_all_services());
        std::process::exit(if result.is_ok() { 0 } else { 1 });
    }
    devstackbox_lib::run()
}
