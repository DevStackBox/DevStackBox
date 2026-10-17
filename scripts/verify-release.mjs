import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
const config = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json")));
const cargo = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
if (config.version !== pkg.version || !cargo.includes(`version = "${pkg.version}"`)) throw new Error("Release versions disagree");
const installerHooks = fs.readFileSync(path.join(root, "src-tauri/nsis/hooks.nsh"), "utf8");
if (!installerHooks.includes('ReadRegStr $R7 HKCU "${UNINSTKEY}" "InstallLocation"') || !installerHooks.includes('DeleteRegKey HKCU "${UNINSTKEY}"')) {
 throw new Error("Installer must remove a stale same-path per-user uninstall registration when migrating to a machine install");
}
for (const rel of ["apache/bin/httpd.exe", "apache/bin/openssl.exe", "mysql/bin/mysqld.exe", "mysql/bin/mysql.exe", "mysql/bin/mysqldump.exe", "mysql/bin/mysqladmin.exe", "php/8.3/php.exe", "php/8.3/php-cgi.exe"]) {
 const file = path.join(root, rel);
 const fd = fs.openSync(file, "r"); const magic = Buffer.alloc(2); fs.readSync(fd, magic); fs.closeSync(fd);
 if (magic.toString() !== "MZ" || fs.statSync(file).size < 4096) throw new Error(`Missing or invalid bundled binary: ${rel}`);
}
for (const rel of ["phpmyadmin/index.php", "docs/images/logo/icon-512.png", "src-tauri/icons/icon.ico"]) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing resource: ${rel}`);
console.log(`Release inputs verified: ${pkg.version}`);
