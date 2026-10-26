import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, readFileSync, writeFileSync, rmSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const repo = fileURLToPath(new URL('../', import.meta.url));
test('native PHP launcher: defaults, stdin/arguments, custom ini, exit codes and selected runtime', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dsb PHP cli '));
  const profile = path.join(root, 'profile with spaces');
  mkdirSync(path.join(root, 'bin')); mkdirSync(path.join(root, 'php'));
  copyFileSync(path.join(repo, 'packaging/php-cli/php.exe'), path.join(root, 'bin/php.exe'));
  symlinkSync(path.join(repo, 'php/8.3'), path.join(root, 'php/8.3'), 'junction');
  const run = (args, input) => spawnSync(path.join(root, 'bin/php.exe'), args, { cwd: root, env: { ...process.env, DEVSTACKBOX_DATA_DIR: profile }, input, encoding: 'utf8', windowsHide: true });
  try {
    const probe = run(['-r', '$f=tmpfile();echo json_encode(["tmp"=>sys_get_temp_dir(),"writable"=>$f!==false,"ini"=>php_ini_loaded_file(),"modules"=>get_loaded_extensions()]);']);
    assert.equal(probe.status, 0, probe.stderr); assert.equal(probe.stderr, '');
    const data = JSON.parse(probe.stdout);
    assert.equal(data.writable, true); assert.equal(data.tmp.replaceAll('\\','/'), path.join(profile,'tmp').replaceAll('\\','/'));
    for (const ext of ['ctype','curl','dom','fileinfo','filter','hash','mbstring','openssl','pcre','PDO','session','tokenizer','xml','mysqli','pdo_mysql','pdo_sqlite','sqlite3','gd','zip','intl','exif','sodium']) assert.ok(data.modules.includes(ext), `Missing ${ext}`);
    const viaStdin = run([], '<?php echo "stdin works";'); assert.equal(viaStdin.stdout, 'stdin works');
    assert.equal(run(['-r','exit(23);']).status, 23);
    assert.equal(run(['-r','echo $argv[1];','--','spaces & "quotes"']).stdout, 'spaces & "quotes"');
    const ini = path.join(profile,'config/php.ini');
    const custom = path.join(root,'custom temp'); mkdirSync(custom);
    writeFileSync(ini, `sys_temp_dir="${custom.replaceAll('\\','/')}"\nextension_dir="${path.join(repo,'php/8.3/ext').replaceAll('\\','/')}"\n;extension=curl\n`);
    const before = readFileSync(ini,'utf8');
    const explicitIni = path.join(root, 'explicit.ini');
    writeFileSync(explicitIni, `sys_temp_dir="${custom.replaceAll('\\','/')}"\n`);
    assert.equal(run(['-c',explicitIni,'-r','echo sys_get_temp_dir();']).stdout,custom.replaceAll('\\','/'));
    const existing = run(['-r','echo json_encode([sys_get_temp_dir(),extension_loaded("curl")]);']);
    assert.deepEqual(JSON.parse(existing.stdout), [custom.replaceAll('\\','/'), false]);
    assert.equal(readFileSync(ini,'utf8'), before);
    writeFileSync(ini, '; previous profile with no sys_temp_dir\n; phpImportLimitsVersion: 1\n');
    const migrated = run(['-r','$f=tmpfile();echo $f ? "TMPFILE_OK" : "FAIL";']);
    assert.equal(migrated.stdout,'TMPFILE_OK');
    assert.equal(readFileSync(ini,'utf8'), '; previous profile with no sys_temp_dir\n; phpImportLimitsVersion: 1\n');
    // A current junction is resolved per command, not captured in PATH.
    symlinkSync(path.join(repo,'php/8.3'),path.join(root,'php/current'),'junction');
    assert.equal(run(['-n','-r','echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;']).stdout,'8.3');
    if (existsSync(path.join(repo,'php/8.5/php.exe'))) {
      rmdirSync(path.join(root,'php/current'));
      symlinkSync(path.join(repo,'php/8.5'),path.join(root,'php/current'),'junction');
      assert.equal(run(['-n','-r','echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;']).stdout,'8.5');
    }
  } finally {
    // Explicitly unlink junctions before deleting only the temporary fixture.
    for (const name of ['current','8.3']) { try { rmdirSync(path.join(root,'php',name)); } catch {} }
    rmSync(root, { recursive:true, force:true });
  }
});
