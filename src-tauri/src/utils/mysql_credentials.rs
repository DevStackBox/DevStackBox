// Optional stored password for DevStackBox MySQL root (when set via the UI).

use serde::{Deserialize, Serialize};

use crate::utils::paths::user_config_dir;

const CREDENTIALS_FILE: &str = "mysql-root.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StoredRootCredentials {
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub protected: Option<Vec<u8>>,
}

fn credentials_path() -> std::path::PathBuf {
    user_config_dir().join(CREDENTIALS_FILE)
}

pub fn read_stored_root_password() -> Option<String> {
    let path = credentials_path();
    if !path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&path).ok()?;
    let creds: StoredRootCredentials = serde_json::from_str(&raw).ok()?;
    if let Some(encrypted) = creds.protected {
        return protect(&encrypted, false).ok().and_then(|bytes| String::from_utf8(bytes).ok());
    }
    let password = creds.password.filter(|p| !p.is_empty());
    if password.is_some() { let _ = write_stored_root_password(password.clone()); }
    password
}

pub fn write_stored_root_password(password: Option<String>) -> Result<(), String> {
    let path = credentials_path();
    let protected = password.as_ref().map(|value| protect(value.as_bytes(), true)).transpose()?;
    let creds = StoredRootCredentials { password: None, protected };
    let json = serde_json::to_string_pretty(&creds)
        .map_err(|e| format!("Failed to serialize MySQL credentials: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write MySQL credentials: {}", e))
}

#[cfg(windows)]
fn protect(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN};
    use windows_sys::Win32::Foundation::LocalFree;
    let input = CRYPT_INTEGER_BLOB { cbData: bytes.len() as u32, pbData: bytes.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    // Windows DPAPI binds the ciphertext to the current Windows user.
    let success = unsafe {
        if encrypt { CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
        else { CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
    };
    if success == 0 { return Err(format!("Windows could not protect/unprotect MySQL credentials: {}", std::io::Error::last_os_error())); }
    let result = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData as _); }
    Ok(result)
}

#[cfg(not(windows))]
fn protect(_bytes: &[u8], _encrypt: bool) -> Result<Vec<u8>, String> {
    Err("Protected credential storage requires Windows.".into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn protected_credentials_round_trip() {
        let plain = b"DevStackBox-test-only-password";
        let encrypted = protect(plain, true).unwrap();
        assert_ne!(encrypted, plain);
        assert_eq!(protect(&encrypted, false).unwrap(), plain);
    }
}
