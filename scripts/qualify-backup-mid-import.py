# Reuse only a marked disposable environment created by qualify-backup.py.
import pathlib,sys,os,subprocess,json,time,zipfile,shutil
root=pathlib.Path(sys.argv[1]).resolve();install=root/'install';profile=root/'profile'
assert root.parent.name=='review-artifacts' and (install/'qualification.marker').exists() and (profile/'qualification.marker').exists()
repo=pathlib.Path(__file__).resolve().parents[1]
shutil.copy2(repo/'src-tauri/target/release/examples/backup_qualification.exe',install/'backup_qualification.exe')
port=next(l.split('=')[1] for l in (profile/'config/my.cnf').read_text().splitlines() if l.startswith('port='))
flags=subprocess.CREATE_NO_WINDOW
server=subprocess.Popen([str(install/'mysql/bin/mysqld.exe'),f'--defaults-file={profile/"config/my.cnf"}'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=flags)
def query(sql):
 r=subprocess.run([str(install/'mysql/bin/mysql.exe'),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',port,'-u','root','-N','-B'],input=sql,text=True,capture_output=True,creationflags=flags,timeout=30)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
def launch(mode,archive='',action=''):
 env=os.environ.copy();env.update(DEVSTACKBOX_DATA_DIR=str(profile),QUAL_MODE=mode,QUAL_PHASE='restoring_mysql',QUAL_ACTION=action,QUAL_ARCHIVE=str(archive))
 (profile/'result.json').unlink(missing_ok=True)
 return subprocess.Popen([str(install/'backup_qualification.exe')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=flags)
results=[]
try:
 for i in range(100):
  try:query('SELECT 1');break
  except Exception:time.sleep(.2)
 archive=profile/'backups/full/mid-import.zip'
 with zipfile.ZipFile(archive,'w') as z:
  z.writestr('manifest.json',json.dumps(dict(app_version='test',created_at_secs=0,contents=['config','www','mysql'])))
  z.writestr('mysql/all-databases.sql',"UPDATE qual.sentinel SET value='partial'; SELECT SLEEP(12); UPDATE qual.sentinel SET value='late';")
  z.writestr('www/sentinel.txt','late')
 for action in ['cancel-delay','external-kill']:
  query("UPDATE qual.sentinel SET value='original';");(install/'www/sentinel.txt').write_text('original')
  before=set((profile/'backups/full').glob('*.recovery.json'))
  child=launch('restore',archive,action)
  reached=False
  for _ in range(300):
   if query('SELECT value FROM qual.sentinel')=='partial':reached=True;break
   if child.poll() is not None:break
   time.sleep(.05)
  assert reached,'SQL phase not reached'
  if action=='external-kill':child.kill()
  child.wait(timeout=30)
  value=query('SELECT value FROM qual.sentinel')
  # Wait beyond SQL sleep to detect a child surviving the parent kill.
  time.sleep(13)
  later=query('SELECT value FROM qual.sentinel')
  restart=launch('restart');restart.wait(timeout=20)
  after_restart=query('SELECT value FROM qual.sentinel')
  records=set((profile/'backups/full').glob('*.recovery.json'))-before
  assert len(records)==1
  record=next(iter(records));recovery=json.loads(record.read_text())['recovery_backup']
  restore=launch('restore',recovery);restore.wait(timeout=60)
  outcome=json.loads((profile/'result.json').read_text())
  restored=query('SELECT value FROM qual.sentinel')=='original' and (install/'www/sentinel.txt').read_text()=='original'
  result=dict(action=action,partial_observed=True,after_exit=value,after_child_wait=later,after_restart=after_restart,recovery_result=outcome,recovery_restored_original=restored,record=str(record))
  results.append(result);(root/'mid-import-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(result),flush=True)
  assert restored
finally:
 subprocess.run([str(install/'mysql/bin/mysqladmin.exe'),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',port,'-u','root','shutdown'],capture_output=True,creationflags=flags,timeout=20)
 try:server.wait(timeout=15)
 except subprocess.TimeoutExpired:server.kill();server.wait()
