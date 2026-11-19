import os, pathlib, subprocess, shutil, socket, time, json, hashlib, zipfile
repo=pathlib.Path(__file__).resolve().parents[1]
root=repo/'review-artifacts'/('backup-qualification-'+str(int(time.time())))
install=root/'install'; profile=root/'profile'
for p in [install,profile,profile/'config',profile/'mysql-data',install/'www'] : p.mkdir(parents=True,exist_ok=True)
for p in [install,profile]: (p/'qualification.marker').write_text('Disposable qualification environment')
shutil.copy2(repo/'src-tauri/target/release/examples/backup_qualification.exe',install/'backup_qualification.exe')
shutil.copytree(repo/'mysql',install/'mysql',ignore=shutil.ignore_patterns('data'))
exe=install/'backup_qualification.exe'; mysql=install/'mysql/bin/mysql.exe'; mysqld=install/'mysql/bin/mysqld.exe'
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
cnf=f'[mysqld]\nport={port}\nbasedir={str(install/"mysql").replace(chr(92),"/")}\ndatadir={str(profile/"mysql-data").replace(chr(92),"/")}\nbind-address=127.0.0.1\nmysqlx=0\n[client]\nport={port}\n'
(profile/'config/my.cnf').write_text(cnf)
flags=subprocess.CREATE_NO_WINDOW
with (root/'init.log').open('w') as log: subprocess.run([str(mysqld),'--no-defaults','--initialize-insecure',f'--basedir={install/"mysql"}',f'--datadir={profile/"mysql-data"}'],stdout=log,stderr=log,check=True,creationflags=flags)
log=(root/'server.log').open('w');server=subprocess.Popen([str(mysqld),f'--defaults-file={profile/"config/my.cnf"}'],stdout=log,stderr=log,creationflags=flags)
def query(sql):
 r=subprocess.run([str(mysql),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',str(port),'-u','root','-N','-B'],input=sql,text=True,capture_output=True,creationflags=flags,timeout=30)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout.strip()
results=[]

def destination_snapshot():
 # Compare every destination file and the complete logical database state,
 # rather than relying only on the sentinel values.
 trees={}
 for label,base in [('config',profile/'config'),('www',install/'www')]:
  trees[label]={str(p.relative_to(base)):hashlib.sha256(p.read_bytes()).hexdigest() for p in base.rglob('*') if p.is_file()}
 dump=subprocess.run([str(install/'mysql/bin/mysqldump.exe'),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',str(port),'-u','root','--all-databases','--skip-comments','--skip-dump-date','--skip-lock-tables'],capture_output=True,creationflags=flags,timeout=30,check=True)
 trees['database_sha256']=hashlib.sha256(dump.stdout).hexdigest()
 return trees
def run(mode,phase='',action='',archive=''):
 env=os.environ.copy();env.update(DEVSTACKBOX_DATA_DIR=str(profile),QUAL_MODE=mode,QUAL_PHASE=phase,QUAL_ACTION=action,QUAL_ARCHIVE=str(archive))
 for n in ['result.json','phase-reached']:
  (profile/n).unlink(missing_ok=True)
 r=subprocess.run([str(exe)],env=env,capture_output=True,text=True,creationflags=flags,timeout=120)
 name=f'{len(results):03}-{mode}-{phase}-{action}'
 (root/(name+'.log')).write_text(r.stdout+'\n'+r.stderr)
 result=json.loads((profile/'result.json').read_text()) if (profile/'result.json').exists() else None
 entry=dict(mode=mode,phase=phase,action=action,exit=r.returncode,reached=(profile/'phase-reached').exists(),result=result)
 results.append(entry);(root/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(entry),flush=True)
 return result
try:
 for i in range(120):
  try: query('SELECT 1');break
  except Exception: time.sleep(.25)
 query('CREATE DATABASE qual; CREATE TABLE qual.sentinel(id INT PRIMARY KEY, value VARCHAR(50)); INSERT INTO qual.sentinel VALUES(1,"baseline");')
 (install/'www/sentinel.txt').write_text('baseline')
 result=run('backup');baseline=result['Ok']
 query('UPDATE qual.sentinel SET value="original";');(install/'www/sentinel.txt').write_text('original')
 result=run('restore',archive=baseline)
 assert result and 'Ok' in result
 assert query('SELECT value FROM qual.sentinel')=='baseline';assert (install/'www/sentinel.txt').read_text()=='baseline'
 recovery=max((profile/'backups/full').glob('*before-restore-*.zip'),key=lambda p:p.stat().st_mtime)
 result=run('restore',archive=recovery)
 assert result and 'Ok' in result
 assert query('SELECT value FROM qual.sentinel')=='original';assert (install/'www/sentinel.txt').read_text()=='original'
 # Bounded malicious archives are passed through the actual restore command.
 manifest=json.dumps(dict(app_version='test',created_at_secs=0,contents=['config','www']))
 for kind in ['manifest','count','duplicate','traversal','ads','link','crc','mismatch']:
  archive=profile/'backups/full'/('malformed-'+kind+'.zip')
  with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
   z.writestr('manifest.json',' '*65537 if kind=='manifest' else manifest)
   if kind=='count':
    for i in range(100001):z.writestr('www/'+str(i),b'')
   if kind=='duplicate':z.writestr('www/A',b'1');z.writestr('www/a',b'2')
   if kind=='traversal':z.writestr('../outside',b'bad')
   if kind=='ads':z.writestr('www/sentinel.txt:extra',b'bad')
   if kind=='link':
    info=zipfile.ZipInfo('www/link');info.create_system=3;info.external_attr=0o120777<<16;z.writestr(info,b'outside')
   if kind=='crc':z.writestr('www/crc',b'CRC_SENTINEL')
   if kind=='mismatch':z.writestr('mysql/all-databases.sql',b'DROP DATABASE qual;')
  if kind=='crc':archive.write_bytes(archive.read_bytes().replace(b'CRC_SENTINEL',b'CRC_CORRUPT!'))
  before=destination_snapshot()
  result=run('restore',archive=archive)
  assert result and 'Err' in result,kind
  after=destination_snapshot()
  (root/('rejection-state-'+kind+'.json')).write_text(json.dumps(dict(before=before,after=after,unchanged=before==after),indent=2))
  assert before==after,kind
 for mode,phases in [('backup',['preparing','config','www','mysql']),('restore',['preparing','recovery','restoring_config','restoring_mysql','restoring_www'])]:
  for phase in phases:
   for action in ['cancel','kill','services']:
    run(mode,phase,action,baseline)
    assert results[-1]['reached'],(mode,phase,action)
    if action=='services':
     assert results[-1]['result'] and 'Ok' in results[-1]['result']
     assert 'SERVICE_STOPS_REJECTED' in (root/f'{len(results)-1:03}-{mode}-{phase}-{action}.log').read_text()
     assert 'APPLICATION_QUIT_REJECTED' in (root/f'{len(results)-1:03}-{mode}-{phase}-{action}.log').read_text()
    elif action=='kill':
     assert results[-1]['exit']!=0 and results[-1]['result'] is None
    elif (mode,phase)!=('restore','restoring_www'):
     assert results[-1]['result'] and 'cancelled' in results[-1]['result'].get('Err','').lower()
    before=query('SELECT value FROM qual.sentinel');file_before=(install/'www/sentinel.txt').read_bytes()
    run('restart')
    assert query('SELECT value FROM qual.sentinel')==before
    assert (install/'www/sentinel.txt').read_bytes()==file_before
 (root/'completed.txt').write_text('Roundtrip and phase-boundary matrix completed; see results, not an installed-GUI or mid-statement test.')
finally:
 try: subprocess.run([str(install/'mysql/bin/mysqladmin.exe'),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',str(port),'-u','root','shutdown'],creationflags=flags,timeout=20,capture_output=True)
 finally:
  try:server.wait(timeout=15)
  except subprocess.TimeoutExpired:server.kill();server.wait()
  log.close()
 print('EVIDENCE',root,flush=True)
