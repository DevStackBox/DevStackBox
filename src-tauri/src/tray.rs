use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::commands::{apache, database_workspace, mysql, php, system};
use crate::types::ServiceInfo;
use crate::utils::{app_settings::read_app_settings, paths::user_www_dir};

#[derive(serde::Serialize, Clone, PartialEq, Default)]
pub struct ServiceStatusSnapshot {
    revision: u64,
    apache: Option<ServiceInfo>,
    mysql: Option<ServiceInfo>,
    php: Option<ServiceInfo>,
}

#[derive(Clone, Copy, PartialEq, Eq, Default)]
enum Status {
    #[default]
    Unknown,
    Running,
    Stopped,
    Starting,
    Stopping,
}

impl Status {
    fn from_info(info: &Option<ServiceInfo>) -> Self {
        match info.as_ref().map(|s| s.running) {
            Some(true) => Self::Running,
            Some(false) => Self::Stopped,
            None => Self::Unknown,
        }
    }
    fn item(self, service: &str, hi: bool) -> (String, String, bool) {
        let (verb, label) = match (self, hi) {
            (Self::Running, false) => ("stop", format!("Stop {service}")),
            (Self::Running, true) => ("stop", format!("{service} रोकें")),
            (Self::Stopped, false) => ("start", format!("Start {service}")),
            (Self::Stopped, true) => ("start", format!("{service} शुरू करें")),
            (Self::Starting, false) => ("busy", format!("Starting {service}…")),
            (Self::Starting, true) => ("busy", format!("{service} शुरू हो रहा है…")),
            (Self::Stopping, false) => ("busy", format!("Stopping {service}…")),
            (Self::Stopping, true) => ("busy", format!("{service} रुक रहा है…")),
            (Self::Unknown, false) => ("unknown", format!("{service} — status unknown")),
            (Self::Unknown, true) => ("unknown", format!("{service} — स्थिति अज्ञात")),
        };
        (
            format!("{verb}-{service}"),
            label,
            matches!(self, Self::Running | Self::Stopped),
        )
    }
    fn description(self, hi: bool) -> &'static str {
        match self {
            Self::Running => word(hi, "Running", "चालू"),
            Self::Stopped => word(hi, "Stopped", "बंद"),
            Self::Unknown => word(hi, "Unknown", "अज्ञात"),
            Self::Starting => word(hi, "Starting", "शुरू हो रहा है"),
            Self::Stopping => word(hi, "Stopping", "रुक रहा है"),
        }
    }
}
fn word(hi: bool, en: &'static str, hindi: &'static str) -> &'static str {
    if hi {
        hindi
    } else {
        en
    }
}

// Service commands already share the database operation lock. This watch channel only
// reports their progress (including actions from Dashboard); it never authorizes work.
type Transition = Option<(&'static str, Status)>;
static SERVICE_ACTIVITY: std::sync::LazyLock<tokio::sync::watch::Sender<Transition>> =
    std::sync::LazyLock::new(|| tokio::sync::watch::channel(None).0);

pub(crate) struct ServiceActivity;
impl ServiceActivity {
    pub(crate) fn starting(service: &'static str) -> Self {
        SERVICE_ACTIVITY.send_replace(Some((service, Status::Starting)));
        Self
    }
    pub(crate) fn stopping(service: &'static str) -> Self {
        SERVICE_ACTIVITY.send_replace(Some((service, Status::Stopping)));
        Self
    }
}
impl Drop for ServiceActivity {
    fn drop(&mut self) {
        SERVICE_ACTIVITY.send_replace(None);
    }
}

#[derive(Clone, Copy, Default, PartialEq)]
struct MenuState {
    shown: bool,
    hindi: bool,
    apache: Status,
    mysql: Status,
    pending: Transition,
    activity: Transition,
}
impl MenuState {
    fn service(self, name: &str) -> Status {
        if let Some((service, state)) = self.pending.or(self.activity) {
            if name == service {
                return state;
            }
        }
        if name == "Apache" {
            self.apache
        } else {
            self.mysql
        }
    }
    fn phpmyadmin_enabled(self) -> bool {
        self.service("Apache") == Status::Running && self.service("MySQL") == Status::Running
    }
}

#[derive(Default)]
struct Monitor {
    last: Option<ServiceStatusSnapshot>,
    started: Option<Instant>,
}

#[derive(Default)]
struct TrayState {
    model: Mutex<MenuState>,
    scan: tokio::sync::Mutex<Monitor>,
}

fn render(app: &AppHandle, model: MenuState) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id("main") else {
        return Ok(());
    };
    let hi = model.hindi;
    let mut menu = MenuBuilder::new(app);
    menu = if model.shown {
        menu.text("hide", word(hi, "Hide window", "विंडो छिपाएँ"))
    } else {
        menu.text("show", word(hi, "Open DevStackBox", "DevStackBox खोलें"))
    }
    .separator();
    for service in ["Apache", "MySQL"] {
        let (id, label, enabled) = model.service(service).item(service, hi);
        let item = tauri::menu::MenuItem::with_id(
            app,
            id,
            label,
            enabled && model.pending.is_none() && model.activity.is_none(),
            None::<&str>,
        )?;
        menu = menu.item(&item);
    }
    let pma = tauri::menu::MenuItem::with_id(
        app,
        "phpmyadmin",
        word(hi, "Open phpMyAdmin", "phpMyAdmin खोलें"),
        model.phpmyadmin_enabled(),
        None::<&str>,
    )?;
    let menu = menu
        .separator()
        .item(&pma)
        .text(
            "www",
            word(hi, "Open default web folder", "डिफ़ॉल्ट वेब फ़ोल्डर खोलें"),
        )
        .separator()
        .text("quit", word(hi, "Quit DevStackBox", "DevStackBox बंद करें"))
        .build()?;
    tray.set_menu(Some(menu))?;
    tray.set_tooltip(Some(format!(
        "DevStackBox\nApache: {}\nMySQL: {}",
        model.service("Apache").description(hi),
        model.service("MySQL").description(hi)
    )))
}

// Run menu updates on the UI thread in order. Release the model lock before calling native APIs.
fn change(app: &AppHandle, update: impl FnOnce(&mut MenuState) + Send + 'static) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(state) = handle.try_state::<TrayState>() else {
            return;
        };
        let model = {
            let mut model = state.model.lock().unwrap();
            let old = *model;
            update(&mut model);
            if old == *model {
                return;
            }
            *model
        };
        if let Err(error) = render(&handle, model) {
            eprintln!("Tray menu: {error}");
        }
    });
}
pub fn set_language(app: &AppHandle, language: &str) {
    let hindi = language == "hi";
    change(app, move |m| m.hindi = hindi);
}
pub fn sync_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if let (Ok(visible), Ok(minimized)) = (w.is_visible(), w.is_minimized()) {
            change(app, move |m| m.shown = visible && !minimized);
        }
    }
}
pub fn reveal(app: &AppHandle) -> Result<(), String> {
    let w = app
        .get_webview_window("main")
        .ok_or("Main window unavailable")?;
    let result = (|| -> tauri::Result<()> {
        if !w.is_visible()? {
            w.show()?;
        }
        if w.is_minimized()? {
            w.unminimize()?;
        }
        if !w.is_focused()? {
            w.set_focus()?;
        }
        Ok(())
    })();
    sync_window(app);
    result.map_err(|e| e.to_string())
}
pub fn hide(app: &AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Main window unavailable")?
        .hide()
        .map_err(|e| e.to_string())?;
    sync_window(app);
    Ok(())
}

async fn scan(app: &AppHandle, monitor: &mut Monitor) -> ServiceStatusSnapshot {
    monitor.started = Some(Instant::now());
    let processes =
        crate::utils::process::batch_find_processes_by_image(&["httpd.exe", "mysqld.exe"]);
    let (apache, mysql) = match processes {
        Ok(batch) => (
            apache::status_from_processes(&batch).await,
            mysql::status_from_processes(&batch).await,
        ),
        Err(_) => (None, None),
    };
    let mut snapshot = ServiceStatusSnapshot {
        revision: monitor.last.as_ref().map_or(0, |s| s.revision),
        apache,
        mysql,
        php: php::get_php_status().await.ok(),
    };
    if monitor.last.as_ref() != Some(&snapshot) {
        snapshot.revision += 1;
        let apache = Status::from_info(&snapshot.apache);
        let mysql = Status::from_info(&snapshot.mysql);
        change(app, move |m| {
            m.apache = apache;
            m.mysql = mysql;
        });
        let _ = app.emit("service-status-snapshot", &snapshot);
        monitor.last = Some(snapshot.clone());
    }
    snapshot
}
pub async fn refresh_tray_status(app: &AppHandle) -> ServiceStatusSnapshot {
    let request = Instant::now();
    let state = app.state::<TrayState>();
    let mut monitor = state.scan.lock().await;
    if monitor.started.is_some_and(|started| started >= request) {
        if let Some(snapshot) = &monitor.last {
            return snapshot.clone();
        }
    }
    scan(app, &mut monitor).await
}

fn report(app: &AppHandle, detail: String) {
    let _ = reveal(app);
    let hi = app.state::<TrayState>().model.lock().unwrap().hindi;
    let mut dialog = rfd::MessageDialog::new()
        .set_title(word(hi, "DevStackBox tray", "DevStackBox ट्रे"))
        .set_level(rfd::MessageLevel::Warning)
        .set_description(detail);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    dialog.show();
}

fn service_command(app: &AppHandle, name: &'static str, start: bool) {
    let state = app.state::<TrayState>();
    let model = {
        let mut model = state.model.lock().unwrap();
        let expected = if start {
            Status::Stopped
        } else {
            Status::Running
        };
        if model.pending.is_some() || model.activity.is_some() || model.service(name) != expected {
            return;
        }
        model.pending = Some((
            name,
            if start {
                Status::Starting
            } else {
                Status::Stopping
            },
        ));
        *model
    };
    if let Err(error) = render(app, model) {
        eprintln!("Tray menu: {error}");
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app.emit("tray-service-action", name.to_ascii_lowercase());
        let result = match (name, start) {
            ("Apache", true) => apache::start_apache().await,
            ("Apache", false) => apache::stop_apache().await,
            (_, true) => mysql::start_mysql().await,
            (_, false) => mysql::stop_mysql().await,
        };
        let snapshot = refresh_tray_status(&app).await;
        change(&app, |m| m.pending = None);
        let _ = app.emit("tray-service-complete", snapshot);
        if let Err(error) = result {
            report(&app, error);
        }
    });
}

fn handle_menu(app: &AppHandle, id: &str) {
    let result = match id {
        "show" => reveal(app),
        "hide" => hide(app),
        "start-Apache" => return service_command(app, "Apache", true),
        "stop-Apache" => return service_command(app, "Apache", false),
        "start-MySQL" => return service_command(app, "MySQL", true),
        "stop-MySQL" => return service_command(app, "MySQL", false),
        "www" => {
            let folder = user_www_dir();
            std::fs::create_dir_all(&folder)
                .map_err(|e| e.to_string())
                .and_then(|_| {
                    app.opener()
                        .open_path(folder.to_string_lossy(), None::<&str>)
                        .map_err(|e| e.to_string())
                })
        }
        "phpmyadmin" => {
            if !app
                .state::<TrayState>()
                .model
                .lock()
                .unwrap()
                .phpmyadmin_enabled()
            {
                return;
            }
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let result = system::get_phpmyadmin_url().await.and_then(|url| {
                    app.opener()
                        .open_url(url, None::<&str>)
                        .map_err(|e| e.to_string())
                });
                if let Err(error) = result {
                    report(&app, error);
                }
            });
            return;
        }
        "quit" => {
            if database_workspace::has_active_database_operation() {
                let hi = app.state::<TrayState>().model.lock().unwrap().hindi;
                Err(word(
                    hi,
                    "A database operation is running. Wait for it to finish before quitting.",
                    "डेटाबेस का काम चल रहा है। बंद करने से पहले उसके पूरा होने तक प्रतीक्षा करें।",
                )
                .into())
            } else {
                app.exit(0);
                Ok(())
            }
        }
        _ => return,
    };
    if let Err(error) = result {
        report(app, error);
    }
}

pub fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let model = MenuState {
        hindi: read_app_settings().language == "hi",
        ..Default::default()
    };
    app.manage(TrayState {
        model: Mutex::new(model),
        ..Default::default()
    });
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().ok_or("Missing app icon")?.clone())
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let activate = matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            );
            if activate {
                if let Err(error) = reveal(tray.app_handle()) {
                    eprintln!("Opening window: {error}");
                }
            }
        })
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .build(app)?;
    render(app.handle(), model)?;
    sync_window(app.handle());
    let mut activities = SERVICE_ACTIVITY.subscribe();
    let activity_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        while activities.changed().await.is_ok() {
            let activity = *activities.borrow_and_update();
            change(&activity_handle, move |model| model.activity = activity);
        }
    });
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            let state = handle.state::<TrayState>();
            if let Ok(mut monitor) = state.scan.try_lock() {
                if monitor
                    .started
                    .is_none_or(|time| time.elapsed() >= Duration::from_secs(5))
                {
                    scan(&handle, &mut monitor).await;
                }
            };
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn menu_intents_and_availability() {
        assert_eq!(Status::Running.item("Apache", false).0, "stop-Apache");
        assert_eq!(Status::Stopped.item("Apache", false).0, "start-Apache");
        assert!(!Status::Unknown.item("MySQL", false).2);
        let mut menu = MenuState {
            apache: Status::Running,
            mysql: Status::Running,
            ..Default::default()
        };
        assert!(menu.phpmyadmin_enabled());
        menu.pending = Some(("MySQL", Status::Stopping));
        assert!(!menu.phpmyadmin_enabled());
        assert!(!menu.service("MySQL").item("MySQL", true).2);
    }
}
