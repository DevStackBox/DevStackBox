// Isolated loopback regression test. Never reads or writes the installed config.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const apache = path.join(root, 'apache/bin/httpd.exe');
const dir = mkdtempSync(path.join(tmpdir(), 'dsb-overrides-'));
const project = path.join(dir, 'Project with spaces');
mkdirSync(path.join(project, 'public'), { recursive: true });
writeFileSync(path.join(project, '.htaccess'), '<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteRule ^ index.php [L]\n</IfModule>\n');
writeFileSync(path.join(project, '.env'), 'PRIVATE_FIXTURE');
writeFileSync(path.join(project, 'public/.htaccess'), 'RewriteEngine On\nRewriteRule ^route$ ok.txt [L]\n');
writeFileSync(path.join(project, 'public/ok.txt'), 'rewrite worked');
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const p = value => value.replaceAll('\\', '/');
const source = readFileSync(path.join(root, 'src-tauri/src/utils/apache_overrides.rs'), 'utf8');
const baseline = JSON.parse(source.match(/pub const BASELINE: &str = (".*");/)[1]);
const legacy = process.argv.includes('--legacy');
const config = `${legacy ? '' : baseline}
ServerRoot "${p(path.join(root, 'apache'))}"
Listen 127.0.0.1:${port}
ServerName localhost
PidFile "${p(path.join(dir, 'httpd.pid'))}"
ErrorLog "${p(path.join(dir, 'error.log'))}"
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule authz_host_module modules/mod_authz_host.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule mime_module modules/mod_mime.so
TypesConfig "${p(path.join(root, 'apache/conf/mime.types'))}"
DocumentRoot "${p(path.join(project, 'public'))}"
<Directory "${p(path.join(project, 'public'))}">
Options +FollowSymLinks
AllowOverride All
Require local
</Directory>
`;
const file = path.join(dir, 'httpd.conf');
writeFileSync(file, config);
execFileSync(apache, ['-f', file, '-t'], { windowsHide: true });
const child = spawn(apache, ['-X', '-f', file], { windowsHide: true, stdio: 'ignore' });
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${port}/ok.txt`); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, 'Isolated Apache did not start');
  if (legacy) {
    assert.equal((await fetch(`http://127.0.0.1:${port}/route`)).status, 500);
    assert.match(readFileSync(path.join(dir, 'error.log'), 'utf8'), /IfModule not allowed here/);
    console.log('PASS: reproduced original parent .htaccess failure without the baseline.');
  } else {
  for (const resource of ['route', 'ok.txt']) {
    const response = await fetch(`http://127.0.0.1:${port}/${resource}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'rewrite worked');
  }
  assert.equal((await fetch(`http://127.0.0.1:${port}/.env`)).status, 404);
  console.log('PASS: parent .htaccess ignored, public rewrites and assets work, private parent file inaccessible.');
  }
} finally {
  child.kill();
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
  console.log(`Diagnostic fixture retained at ${dir}`);
}
