//! Isolated Apache/CGI check. Does not edit hosts, trust stores or installed profiles.
use devstackbox_lib::{commands::php, utils::paths::*};
use std::{fs, process::Command};
fn main() {
    let root = get_user_data_root();
    assert!(root.to_string_lossy().contains("review-artifacts"));
    let ini = user_config_dir().join("php.ini");
    assert!(!ini.exists(), "Use a fresh disposable profile");
    php::patch_php_ini();
    let original = fs::read_to_string(&ini).unwrap();
    assert!(original.contains("sys_temp_dir ="));
    assert!(original.contains("extension=pdo_sqlite"));
    // Reproduce an older profile where upload-limit migration already ran.
    let old = original.lines().filter(|line| !line.starts_with("sys_temp_dir =")).collect::<Vec<_>>().join("\n");
    fs::write(&ini, old).unwrap();
    php::patch_php_ini();
    assert!(fs::read_to_string(&ini).unwrap().contains("sys_temp_dir ="));
    let www = root.join("probe"); fs::create_dir_all(&www).unwrap();
    fs::write(www.join("index.php"), "<?php header('Content-Type: application/json'); $f=tmpfile(); echo json_encode(['temp'=>sys_get_temp_dir(),'ok'=>$f!==false,'sqlite'=>extension_loaded('pdo_sqlite'),'curl'=>extension_loaded('curl')]);").unwrap();
    let base = get_installation_path(); let apache = base.join("apache"); let runtime = active_php_dir();
    let p = |path: &std::path::Path| to_apache_path(path);
    let mut conf = format!("ServerRoot \"{}\"\nListen 127.0.0.1:18193\nServerName localhost\nPidFile \"{}\"\nErrorLog \"{}\"\n", p(&apache), p(&root.join("httpd.pid")), p(&root.join("apache-test.log")));
    for (name, file) in [("dir","dir"),("mime","mime"),("authz_core","authz_core"),("cgi","cgi"),("alias","alias"),("actions","actions"),("env","env")] {
        conf.push_str(&format!("LoadModule {name}_module \"{}/modules/mod_{file}.so\"\n", p(&apache)));
    }
    conf.push_str(&format!("TypesConfig \"{}/conf/mime.types\"\nDocumentRoot \"{}\"\n<Directory \"{}\">\nRequire all granted\nDirectoryIndex index.php\n</Directory>\nScriptAlias /php/ \"{}/\"\n<Directory \"{}\">\nRequire all granted\nOptions ExecCGI\n</Directory>\nAction php-script /php/php-cgi.exe\nAddHandler php-script .php\nSetEnv PHPRC \"{}\"\n",p(&apache),p(&www),p(&www),p(&runtime),p(&runtime),p(&user_config_dir())));
    let config = root.join("apache-smoke.conf"); fs::write(&config, conf).unwrap();
    let exe = get_apache_exe(&base);
    let mut command = Command::new(&exe); command.arg("-f").arg(&config);
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let mut child = command.spawn().unwrap();
    let result = tauri::async_runtime::block_on(async {
        let client = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(5)).build().unwrap();
        let mut last = String::new();
        for _ in 0..30 {
            match client.get("http://127.0.0.1:18193/").send().await {
                Ok(response) => {
                    if !response.status().is_success() { return Err(format!("HTTP {}", response.status())); }
                    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
                    if json["ok"] != true || json["sqlite"] != true || json["curl"] != true || json["temp"] != p(&user_tmp_dir()) { return Err(json.to_string()); }
                    return Ok(());
                },
                Err(e) => { last = e.to_string(); tokio::time::sleep(std::time::Duration::from_millis(200)).await; }
            }
        }
        Err(last)
    });
    // Console-mode Apache on Windows has no registered service to receive -k shutdown.
    // Stop only this disposable test's process tree, never another installed server.
    let mut stop = Command::new("taskkill.exe"); stop.args(["/PID", &child.id().to_string(), "/T", "/F"]);
    #[cfg(windows)] { use std::os::windows::process::CommandExt; stop.creation_flags(0x08000000); }
    stop.status().unwrap(); child.wait().unwrap();
    fs::remove_file(www.join("index.php")).unwrap();
    result.unwrap();
    println!("PASS: Apache HTTP 200, TMPFILE_OK, user temp path, SQLite/cURL and old-profile temp migration. Probe removed.");
}
