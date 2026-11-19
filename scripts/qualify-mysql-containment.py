"""Only synthetic SQL in a marked environment created by qualify-backup.py.
Uses real Windows process handles (not PID-only polling) for death evidence.
"""
import ctypes, json, os, pathlib, shutil, subprocess, sys, time, zipfile
from ctypes import wintypes

repo = pathlib.Path(__file__).resolve().parents[1]
root = pathlib.Path(sys.argv[1]).resolve()
assert root.parent == repo / 'review-artifacts'
install, profile = root / 'install', root / 'profile'
assert (install / 'qualification.marker').is_file() and (profile / 'qualification.marker').is_file()
evidence = root / ('containment-' + str(int(time.time())))
evidence.mkdir()
for name in ['backup_qualification.exe', 'mysql_containment.exe']:
    shutil.copy2(repo / 'src-tauri/target/release/examples' / name, install / name)
port = next(line.split('=')[1] for line in (profile / 'config/my.cnf').read_text().splitlines() if line.startswith('port='))
flags = subprocess.CREATE_NO_WINDOW
k32 = ctypes.WinDLL('kernel32', use_last_error=True)
k32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
k32.OpenProcess.restype = wintypes.HANDLE
k32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
k32.CloseHandle.argtypes = [wintypes.HANDLE]

def query(sql):
    result = subprocess.run([str(install/'mysql/bin/mysql.exe'), '--no-defaults', '-h', '127.0.0.1', '--protocol=TCP', '-P', port, '-u', 'root', '-N', '-B'], input=sql, text=True, capture_output=True, creationflags=flags, timeout=30)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout.strip()

def active():
    return int(query("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND COMMAND<>'Sleep' AND USER<>'event_scheduler'"))

def settle():
    for _ in range(200):
        if not active(): return
        time.sleep(.1)
    raise AssertionError('Server operation did not settle')

def native(mode, archive='', action=''):
    env = os.environ.copy()
    env.update(DEVSTACKBOX_DATA_DIR=str(profile), QUAL_MODE=mode, QUAL_ARCHIVE=str(archive), QUAL_PHASE='', QUAL_ACTION=action)
    (profile/'result.json').unlink(missing_ok=True)
    result = subprocess.run([str(install/'backup_qualification.exe')], env=env, capture_output=True, text=True, creationflags=flags, timeout=90)
    (evidence/f'native-{time.time_ns()}.log').write_text(result.stdout + result.stderr)
    assert (profile/'result.json').exists(), result.returncode
    return json.loads((profile/'result.json').read_text())

results = []
def save(row):
    results.append(row)
    (evidence/'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(row), flush=True)

server = subprocess.Popen([str(install/'mysql/bin/mysqld.exe'), f'--defaults-file={profile/"config/my.cnf"}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
try:
    for _ in range(100):
        try: query('SELECT 1'); break
        except RuntimeError: time.sleep(.2)
    query("UPDATE qual.sentinel SET value='original'")
    (install/'www/sentinel.txt').write_text('original')
    baseline = native('backup')['Ok']
    for case in ['before_spawn', 'before_stream', 'kill_stream', 'complete', 'cancel', 'timeout', 'error', 'nested']:
        settle()
        query("UPDATE qual.sentinel SET value='original'")
        env = os.environ.copy(); env.update(DEVSTACKBOX_DATA_DIR=str(profile), CONTAINMENT_CASE=case)
        child_handle = None
        parent = subprocess.Popen([str(install/'mysql_containment.exe')], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=flags)
        events = []
        try:
            for line in parent.stdout:
                event = json.loads(line); events.append(event)
                if event.get('child') and not child_handle:
                    child_handle = k32.OpenProcess(0x100000, False, event['child'])
                    assert child_handle, ctypes.get_last_error()
                kill_phase = {'before_spawn':'before_spawn', 'before_stream':'before_stream', 'kill_stream':'streamed', 'complete':'completed'}.get(case)
                if event.get('phase') == kill_phase:
                    if case == 'kill_stream':
                        for _ in range(100):
                            if query('SELECT value FROM qual.sentinel') == 'partial': break
                            time.sleep(.02)
                        assert query('SELECT value FROM qual.sentinel') == 'partial'
                    parent.kill(); break
            parent.wait(timeout=50)
            dead = child_handle is None or k32.WaitForSingleObject(child_handle, 5000) == 0
            assert dead, 'Contained child survived parent'
            during = active()
            overlap = None
            if during:
                overlap = native('restore', baseline)
                assert 'still has another statement' in overlap.get('Err', ''), overlap
            settle()
            value = query('SELECT value FROM qual.sentinel')
            expected = 'complete' if case == 'complete' else 'partial' if case in ['kill_stream','cancel','timeout'] else 'original'
            assert value == expected, (case, value)
            if case in ['cancel','timeout']:
                assert events[-1]['lock_released']
                assert ('cancelled' if case == 'cancel' else 'timed out') in events[-1]['result']['Err'].lower()
            if case == 'error': assert events[-1]['result']['Ok'] != 0 and events[-1]['lock_released']
            if case == 'nested': assert 'completed' in events[-1]['inner']
            save(dict(case=case, parent=parent.pid, events=events, child_dead=dead, server_active_after_exit=during, overlap_restore=overlap, settled=True, value=value))
        finally:
            if parent.poll() is None: parent.kill(); parent.wait()
            if child_handle: k32.CloseHandle(child_handle)
    # End-to-end full restore generates its OWN recovery record before SQL.
    settle(); query("UPDATE qual.sentinel SET value='original'")
    archive = profile/'backups/full/containment-mid-import.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        z.writestr('manifest.json', json.dumps(dict(app_version='test', created_at_secs=0, contents=['config','www','mysql'])))
        z.writestr('mysql/all-databases.sql', "UPDATE qual.sentinel SET value='partial'; SELECT SLEEP(12); UPDATE qual.sentinel SET value='late';")
        z.writestr('www/sentinel.txt', 'late')
    before = set((profile/'backups/full').glob('*.recovery.json'))
    env = os.environ.copy(); env.update(DEVSTACKBOX_DATA_DIR=str(profile), QUAL_MODE='restore', QUAL_ARCHIVE=str(archive), QUAL_PHASE='', QUAL_ACTION='')
    with (evidence/'full-restore.log').open('w') as log:
        parent = subprocess.Popen([str(install/'backup_qualification.exe')], env=env, stdout=log, stderr=log, creationflags=flags)
        for _ in range(300):
            if query('SELECT value FROM qual.sentinel') == 'partial': break
            assert parent.poll() is None
            time.sleep(.1)
        assert query('SELECT value FROM qual.sentinel') == 'partial'
        # MySQL's standard connection attributes identify the actual mysql client.
        pids = query("SELECT ATTR_VALUE FROM performance_schema.session_connect_attrs WHERE ATTR_NAME='_pid' AND PROCESSLIST_ID<>CONNECTION_ID()")
        assert pids, 'Missing client PID connection attribute'
        client_pid = int(pids.splitlines()[0]); client_handle = k32.OpenProcess(0x100000, False, client_pid)
        assert client_handle
        parent.kill(); parent.wait(timeout=10)
        assert k32.WaitForSingleObject(client_handle, 5000) == 0
        k32.CloseHandle(client_handle)
    records = set((profile/'backups/full').glob('*.recovery.json')) - before
    assert len(records) == 1
    record = next(iter(records)); recovery = json.loads(record.read_text())['recovery_backup']
    still_active = active()
    overlap = native('restore', recovery) if still_active else None
    if still_active: assert 'still has another statement' in overlap.get('Err',''), overlap
    settle(); assert query('SELECT value FROM qual.sentinel') == 'partial'
    outcome = native('restore', recovery)
    assert 'Ok' in outcome, outcome
    assert query('SELECT value FROM qual.sentinel') == 'original'
    assert (install/'www/sentinel.txt').read_text() == 'original'
    assert record.exists(), 'Original interrupted record must remain discoverable'
    save(dict(case='full_restore_recovery',parent=parent.pid,child=client_pid,child_dead=True,server_active_after_exit=still_active,overlap_restore=overlap,settled=True,recovery_restored_original=True,retained_record=str(record)))
finally:
    subprocess.run([str(install/'mysql/bin/mysqladmin.exe'),'--no-defaults','-h','127.0.0.1','--protocol=TCP','-P',port,'-u','root','shutdown'], capture_output=True, creationflags=flags, timeout=20)
    try: server.wait(timeout=15)
    except subprocess.TimeoutExpired: server.kill(); server.wait()
    print('EVIDENCE', evidence, flush=True)
