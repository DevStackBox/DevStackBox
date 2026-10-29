import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stagePhpMyAdmin } from "./stage-phpmyadmin.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
const config = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json")));
if (config.bundle.resources["../packaging/phpmyadmin-runtime"] !== "phpmyadmin" || config.bundle.resources["../phpmyadmin"]) throw new Error("Installer must use only the staged phpMyAdmin payload");
stagePhpMyAdmin();
if (config.bundle.resources["../packaging/php-cli"] !== "bin") throw new Error("Installer must include the PHP CLI launcher");
execFileSync(process.execPath, [path.join(root, "scripts/build-php-cli.mjs")], { stdio: "inherit" });
const cargo = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
if (config.version !== pkg.version || !cargo.includes(`version = "${pkg.version}"`)) throw new Error("Release versions disagree");
const installerHooks = fs.readFileSync(path.join(root, "src-tauri/nsis/hooks.nsh"), "utf8");
if (!installerHooks.includes('ReadRegStr $R7 HKCU "${UNINSTKEY}" "InstallLocation"') || !installerHooks.includes('DeleteRegKey HKCU "${UNINSTKEY}"')) {
 throw new Error("Installer must remove a stale same-path per-user uninstall registration when migrating to a machine install");
}
for (const rel of ["apache/bin/httpd.exe", "apache/bin/openssl.exe", "mysql/bin/mysqld.exe", "mysql/bin/mysql.exe", "mysql/bin/mysqldump.exe", "mysql/bin/mysqladmin.exe", "php/8.3/php.exe", "php/8.3/php-cgi.exe", "packaging/php-cli/php.exe"]) {
 const file = path.join(root, rel);
 const fd = fs.openSync(file, "r"); const magic = Buffer.alloc(2); fs.readSync(fd, magic); fs.closeSync(fd);
 if (magic.toString() !== "MZ" || fs.statSync(file).size < 4096) throw new Error(`Missing or invalid bundled binary: ${rel}`);
}
for (const rel of ["phpmyadmin/index.php", "phpmyadmin/config.inc.php", "docs/images/logo/icon-512.png", "src-tauri/icons/icon.ico"]) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing resource: ${rel}`);
const pmaConfig = fs.readFileSync(path.join(root, "phpmyadmin/config.inc.php"), "utf8");
if (!/AllowNoPassword'\]\s*=\s*true/.test(pmaConfig)) throw new Error("phpmyadmin/config.inc.php must set AllowNoPassword = true for local empty root login");
const mysqld = path.join(root, "mysql/bin/mysqld.exe");
const phpExe = path.join(root, "php/8.3/php.exe");
const phpVersion = execFileSync(phpExe, ["-n", "-r", "echo PHP_VERSION;"], { encoding: "utf8", windowsHide: true }).trim();
if (!/^8\.3\.\d+$/.test(phpVersion) || Number(phpVersion.split(".")[2]) < 36) throw new Error(`Bundled PHP must be 8.3.36 or newer on the 8.3 branch; got ${phpVersion}`);

function parseRelease(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(version);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0)];
}
function runtimeMatchesRelease(runtime, release) {
  const a = parseRelease(runtime);
  const b = parseRelease(release);
  if (!a || !b || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) return false;
  return a[3] === 0 || a[3] === b[3];
}
function releaseAtLeast(release, minimum) {
  const a = parseRelease(release);
  const b = parseRelease(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return a[3] >= b[3];
}

const receiptPath = path.join(root, "php/8.3/.devstackbox-release.json");
if (!fs.existsSync(receiptPath)) throw new Error("Bundled PHP 8.3 must include .devstackbox-release.json (run scripts/refresh-php-bundle.ps1)");
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
const packageRelease = receipt.release;
const exeHash = createHash("sha256").update(fs.readFileSync(phpExe)).digest("hex");
if (typeof packageRelease !== "string" || !releaseAtLeast(packageRelease, "8.3.36")) {
  throw new Error(`Bundled PHP package release must be at least 8.3.36; got ${packageRelease}`);
}
if (receipt.exeSha256 !== exeHash) throw new Error("Bundled PHP exeSha256 does not match php/8.3/php.exe");
if (typeof receipt.archiveSha256 !== "string" || receipt.archiveSha256.length !== 64) {
  throw new Error("Bundled PHP receipt must include archiveSha256");
}
if (!runtimeMatchesRelease(phpVersion, packageRelease)) {
  throw new Error(`PHP_VERSION ${phpVersion} does not match package release ${packageRelease}`);
}
console.log(`Bundled PHP package release: ${packageRelease} (PHP_VERSION ${phpVersion})`);
const mysqlVersion = execFileSync(mysqld, ["--version"], { encoding: "utf8" });
if (!/Ver 8\.4\./.test(mysqlVersion)) throw new Error(`Expected bundled MySQL 8.4.x, got: ${mysqlVersion.trim()}`);
console.log(`Release inputs verified: ${pkg.version}`);

const mkcert = fs.readFileSync(path.join(root, "tools/mkcert/mkcert.exe"));
if (createHash("sha256").update(mkcert).digest("hex") !== "d2660b50a9ed59eada480750561c96abc2ed4c9a38c6a24d93e30e0977631398") throw new Error("mkcert v1.4.4 Windows x64 checksum mismatch");
if (!fs.existsSync(path.join(root, "tools/mkcert/LICENSE"))) throw new Error("mkcert license missing");
