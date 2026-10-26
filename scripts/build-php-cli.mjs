import { mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'win32') throw new Error('The Windows PHP launcher must be built on Windows.');
mkdirSync(new URL('../packaging/php-cli/', import.meta.url), { recursive: true });
execFileSync('rustc', ['--edition=2021', '-O', 'src-tauri/php-cli/main.rs', '-o', 'packaging/php-cli/php.exe'], { cwd: root, stdio: 'inherit' });
copyFileSync(new URL('../src-tauri/nsis/manage-php-path.ps1', import.meta.url), new URL('../packaging/php-cli/manage-php-path.ps1', import.meta.url));
console.log('Built native PHP console launcher.');
