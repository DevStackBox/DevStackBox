//! Console launcher installed as bin/php.exe. Resolves PHP on each invocation,
//! forwards arguments without a shell, inherits streams, and returns PHP's exit code.
#[path = "../src/utils/php_defaults.rs"]
mod php_defaults;
use std::{env, fs, io::Write, path::PathBuf, process::{Command, ExitCode}};

fn run() -> Result<i32, Box<dyn std::error::Error>> {
    let executable = env::current_exe()?;
    let installation = executable.parent().and_then(|p| p.parent()).ok_or("Cannot locate DevStackBox installation")?;
    let php = installation.join("php");
    let runtime = [php.join("current"), php.join("8.3"), php.clone()].into_iter().find(|p| p.join("php.exe").is_file()).ok_or("DevStackBox PHP is missing; repair the installation")?;
    let args: Vec<_> = env::args_os().skip(1).collect();
    // Explicit PHP ini selection opts out of DevStackBox's configuration defaults.
    // Stop scanning at the script/code boundary; later strings are program arguments.
    let mut explicit_ini = false;
    let mut skip_value = false;
    for arg in &args {
        let arg = arg.to_string_lossy();
        if skip_value { skip_value = false; continue; }
        if arg == "--" || !arg.starts_with('-') || matches!(arg.as_ref(), "-r" | "-f" | "--run" | "--file") { break; }
        if arg == "-n" || arg == "--no-php-ini" || arg.starts_with("-c") || arg == "--php-ini" || arg.starts_with("--php-ini=") { explicit_ini = true; break; }
        if arg == "-d" || arg == "--define" { skip_value = true; }
    }
    if explicit_ini { return Ok(Command::new(runtime.join("php.exe")).args(args).status()?.code().unwrap_or(1)); }
    let data = env::var_os("DEVSTACKBOX_DATA_DIR").map(PathBuf::from).filter(|p| p.is_absolute())
        .or_else(|| env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("devstackbox")))
        .ok_or("LOCALAPPDATA is unavailable")?;
    let config = data.join("config");
    for dir in [&config, &data.join("tmp"), &data.join("tmp/sessions"), &data.join("logs")] { fs::create_dir_all(dir)?; }
    let ini = config.join("php.ini");
    let slash = |p: PathBuf| p.to_string_lossy().replace('\\', "/");
    if !ini.is_file() {
        let template = [runtime.join("php.ini"), runtime.join("php.ini-production")].into_iter().find(|p| p.is_file()).ok_or("PHP configuration template is missing")?;
        let content = fs::read_to_string(template)?;
        let content = content.lines().filter(|line| {
            let key = line.split('=').next().unwrap_or("").trim();
            !["extension_dir", "session.save_path", "error_log"].iter().any(|name| key.eq_ignore_ascii_case(name))
        }).collect::<Vec<_>>().join("\n");
        let content = format!("extension_dir=\"{}\"\nsession.save_path=\"{}\"\nerror_log=\"{}\"\n{}", slash(runtime.join("ext")), slash(data.join("tmp/sessions")), slash(data.join("logs/php_error.log")), content);
        let content = php_defaults::enable_extensions(content, &runtime.join("ext"));
        let content = php_defaults::temporary_defaults(&content, &slash(data.join("tmp")));
        match fs::OpenOptions::new().write(true).create_new(true).open(&ini) {
            Ok(mut file) => { file.write_all(content.as_bytes())?; file.sync_all()?; },
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {},
            Err(e) => return Err(e.into()),
        }
    }
    // Process-local defaults avoid rewriting an existing user's ini. Explicit
    // -n/-c and subsequent -d arguments retain PHP's configuration semantics.
    let content = fs::read_to_string(&ini)?;
    let mut command = Command::new(runtime.join("php.exe"));
    command.env("PHPRC", &ini);
    for name in ["sys_temp_dir", "upload_tmp_dir"] {
        if php_defaults::needs_default(&content, name) { command.arg("-d").arg(format!("{name}={}", slash(data.join("tmp")))); }
    }
    if php_defaults::needs_default(&content, "sys_temp_dir") { command.env("TMP", data.join("tmp")).env("TEMP", data.join("tmp")); }
    // Child PHP programs (PHP_BINARY) inherit the same configuration location.
    let status = command.args(args).status()?;
    Ok(status.code().unwrap_or(1))
}
fn main() -> ExitCode {
    match run() { Ok(code) => { std::process::exit(code); }, Err(error) => { eprintln!("DevStackBox PHP: {error}"); ExitCode::FAILURE } }
}
