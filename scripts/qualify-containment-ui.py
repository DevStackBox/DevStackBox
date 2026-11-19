"""Prepare/observe only the marked disposable installation for manual GUI tests.
UI input is deliberately not automated here. No production installation touched.
"""
import ctypes, json, os, pathlib, shutil, subprocess, sys, time, zipfile
from ctypes import wintypes
repo = pathlib.Path(__file__).resolve().parents[1]
root = pathlib.Path(sys.argv[1]).resolve()
assert root.parent == repo/'review-artifacts'
install, profile = root/'install', root/'profile'
assert (install/'qualification.marker').is_file() and (profile/'qualification.marker').is_file()
evidence = root/'gui-containment'; evidence.mkdir(exist_ok=True)
port = next(l.split('=')[1] for l in (profile/'config/my.cnf').read_text().splitlines() if l.startswith('port='))
flags = subprocess.CREATE_NO_WINDOW
def query(sql):
    r = subprocess.run([str(install/'mysql/bin/mysql.exe'),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',port,'-u','root','-N','-B'],input=sql,text=True,capture_output=True,creationflags=flags,timeout=30)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()
def launch():
    env = os.environ.copy(); env.update(DEVSTACKBOX_DATA_DIR=str(profile), WEBVIEW2_USER_DATA_FOLDER=str(evidence/'webview'))
    with (evidence/f'app-{time.time_ns()}.log').open('w') as log:
        app = subprocess.Popen([str(install/'devstackbox.exe')],env=env,stdout=log,stderr=log,creationflags=flags)
    (evidence/'app-pid.json').write_text(json.dumps(dict(pid=app.pid)))
    return app.pid
action = sys.argv[2]
if action == 'start':
    shutil.copy2(repo/'src-tauri/target/release/devstackbox.exe',install/'devstackbox.exe')
    with (evidence/'server.log').open('w') as log:
        server = subprocess.Popen([str(install/'mysql/bin/mysqld.exe'),f'--defaults-file={profile/"config/my.cnf"}'],stdout=log,stderr=log,creationflags=flags)
    for _ in range(100):
        try: query('SELECT 1'); break
        except RuntimeError: time.sleep(.2)
    query("UPDATE qual.sentinel SET value='original'")
    (install/'www/sentinel.txt').write_text('original')
    archive = profile/'backups/full/gui-interruption.zip'
    with zipfile.ZipFile(archive,'w') as z:
        z.writestr('manifest.json',json.dumps(dict(app_version='test',created_at_secs=0,contents=['config','www','mysql'])))
        z.writestr('mysql/all-databases.sql',"UPDATE qual.sentinel SET value='partial'; SELECT SLEEP(90); UPDATE qual.sentinel SET value='late';")
        z.writestr('www/sentinel.txt','late')
    before = dict(records=[p.name for p in (profile/'backups/full').glob('*.recovery.json')], database=query('SELECT value FROM qual.sentinel'))
    (evidence/'before-startup.json').write_text(json.dumps(before,indent=2))
    print(json.dumps(dict(app=launch(),server=server.pid,archive=str(archive))))
elif action == 'restart': print(json.dumps(dict(app=launch())))
elif action == 'state':
    state = dict(database=query('SELECT value FROM qual.sentinel'),web=(install/'www/sentinel.txt').read_text(),active=query("SELECT ID,COMMAND FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND COMMAND<>'Sleep' AND USER<>'event_scheduler'"),records=sorted(p.name for p in (profile/'backups/full').glob('*.recovery.json')))
    (evidence/f'state-{time.time_ns()}.json').write_text(json.dumps(state,indent=2)); print(json.dumps(state))
elif action == 'kill':
    k = ctypes.WinDLL('kernel32',use_last_error=True)
    k.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];k.OpenProcess.restype=wintypes.HANDLE
    k.QueryFullProcessImageNameW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
    k.TerminateProcess.argtypes=[wintypes.HANDLE,wintypes.UINT];k.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD];k.CloseHandle.argtypes=[wintypes.HANDLE]
    pid=json.loads((evidence/'app-pid.json').read_text())['pid'];handle=k.OpenProcess(0x101001,False,pid);assert handle
    name=ctypes.create_unicode_buffer(32768);length=wintypes.DWORD(len(name))
    assert k.QueryFullProcessImageNameW(handle,0,name,ctypes.byref(length))
    assert pathlib.Path(name.value).resolve()==install/'devstackbox.exe'
    pids=query("SELECT ATTR_VALUE FROM performance_schema.session_connect_attrs WHERE ATTR_NAME='_pid' AND PROCESSLIST_ID<>CONNECTION_ID()")
    children=[(int(p),k.OpenProcess(0x100000,False,int(p))) for p in pids.splitlines()]
    assert query('SELECT value FROM qual.sentinel')=='partial'
    assert k.TerminateProcess(handle,99);assert k.WaitForSingleObject(handle,5000)==0;k.CloseHandle(handle)
    observations=[]
    for pid_child,h in children:
        assert h; dead=k.WaitForSingleObject(h,5000)==0;k.CloseHandle(h);observations.append(dict(pid=pid_child,dead=dead));assert dead
    assert children
    result=dict(parent=pid,children=observations,database=query('SELECT value FROM qual.sentinel'))
    (evidence/'forced-kill.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
elif action == 'stop':
    print(subprocess.run([str(install/'mysql/bin/mysqladmin.exe'),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',port,'-u','root','shutdown'],capture_output=True,creationflags=flags,timeout=20).returncode)
else: raise ValueError(action)
