import { useEffect, useState } from 'react';
import { LogViewer } from '@/components/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Archive, FolderOpen, RefreshCw } from 'lucide-react';
import { safeInvoke, isTauri } from '@/lib/tauri';
import { useLogStream, type LogCursor } from '@/hooks/use-log-stream';

interface Policy { enabled: boolean; rotate_mib: number; retention_days: number; per_log: number; budget_mib: number; }
interface ArchivedLog { id: string; source: string; created: number; original_bytes: number; bytes: number; sha256: string; }
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const labels: Record<string, string> = { apache: 'Apache error', 'apache-access': 'Apache access', mysql: 'MySQL error', php: 'PHP global error', crash: 'DevStackBox crash' };
export function WorkspaceLogViewer({ service }: { service: 'apache' | 'mysql' | 'php' }) {
  const [selected, setSelected] = useState(service as string);
  const [panel, setPanel] = useState<'live' | 'archives' | 'rotation'>('live');
  const [auto, setAuto] = useState(true);
  const [scroll, setScroll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [records, setRecords] = useState<ArchivedLog[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [deletion, setDeletion] = useState<ArchivedLog | 'active' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [deleteCursor, setDeleteCursor] = useState<LogCursor | null>(null);
  const stream = useLogStream(selected, auto, panel === 'live' && deletion === null);
  const filename = stream.data?.path.split(/[\\/]/).pop() ?? '';
  const options = service === 'apache' ? ['apache', 'apache-access', 'crash'] : service === 'php' ? ['php', 'php-8.2', 'php-8.3', 'php-8.4', 'php-8.5', 'php-8.1'] : ['mysql'];
  const title = labels[selected] ?? `${selected.replace('php-', 'PHP ')} error`;
  useEffect(() => { setSelected(service); }, [service]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(''); setNotice('');
    try { if (!isTauri()) throw new Error('Log management requires the desktop app.'); await action(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function loadArchives() { setRecords(await safeInvoke<ArchivedLog[]>('list_log_archives') ?? []); }
  useEffect(() => {
    if (panel === 'archives') void run(loadArchives);
    if (panel === 'rotation') void run(async () => { setPolicy(await safeInvoke<Policy>('get_log_policy')); });
  }, [panel]);
  const deleteTarget = deletion === 'active' ? filename : deletion?.id ?? '';
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2" aria-label="Log tools">
      {(['live', 'archives', 'rotation'] as const).map(value => <Button key={value} size="sm" variant={panel === value ? 'default' : 'outline'} aria-pressed={panel === value} disabled={busy} onClick={() => { setPanel(value); setError(''); setNotice(''); }}>{value === 'live' ? 'Live log' : value === 'archives' ? 'Archives' : 'Rotation & retention'}</Button>)}
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive break-words">{error}</p>}
    {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
    {panel === 'live' && <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">Log file
          <select aria-label="Log file" className="h-9 rounded-md border bg-background px-2" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setError(''); setNotice(''); }}>
            {options.map(id => <option key={id} value={id}>{labels[id] ?? `${id.replace('php-', 'PHP ')} error${id === 'php-8.1' ? ' (legacy)' : ''}`}</option>)}
          </select>
        </label>
        <Button variant="outline" size="sm" disabled={busy || stream.refreshing} onClick={() => void run(stream.refresh)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Auto-refresh</label>
        <span className="text-xs text-muted-foreground">2s while changing, 10s when idle; paused in the background.</span>
      </div>
      {stream.error && <p role="alert" className="text-sm text-destructive">{stream.error} Previous entries may be outdated.</p>}
      <div className="space-y-1 text-sm text-muted-foreground">
        <p className="break-all">{stream.data?.path ?? 'Reading log metadata…'}{stream.data && ` · ${size(stream.data.size)}`}</p>
        <p>{stream.data?.missing ? 'This log has not been written yet.' : stream.data?.cleared ? 'Earlier entries are hidden from this view. The log file is unchanged.' : 'Showing a bounded recent tail, not the full file.'}</p>
        {stream.data?.skipped && <p>Older entries were omitted to keep the viewer responsive.</p>}
        {stream.data && stream.data.size >= (policy?.rotate_mib ?? 20) * 1024 * 1024 && <p className="text-foreground">Large log: archive it after stopping its writers, or enable rotation for the next safe opportunity.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || !stream.data} onClick={() => void run(stream.clearView)}>Clear view</Button>
        <Button variant="outline" size="sm" disabled={busy || stream.refreshing} onClick={() => void run(stream.history)}>Show recent history</Button>
        <Button variant="outline" size="sm" disabled={busy || !stream.data?.size} onClick={() => void run(async () => { const result = await safeInvoke<ArchivedLog>('archive_log', { id: selected }); await stream.history(); if (result) setNotice(`Archived as ${result.id}.log.gz. The active log is now empty.`); })}><Archive className="mr-2 h-4 w-4" />Archive current log</Button>
        <Button variant="outline" size="sm" className="text-destructive" disabled={busy || !stream.data?.cursor || !stream.data?.size} onClick={() => { setConfirmation(''); setDeleteCursor(stream.data?.cursor ?? null); setDeletion('active'); }}>Delete log contents…</Button>
      </div>
      <p className="text-xs text-muted-foreground">Archiving preserves a verified GZIP copy. Apache/MySQL must be stopped; close PHP terminals for PHP logs. Active or locked files are left untouched. Custom log paths are not managed here.</p>
      <LogViewer logs={stream.data?.logs ?? ''} title={title} loading={busy} autoScroll={scroll} onAutoScrollChange={setScroll} emptyLabel={stream.data?.cleared ? "No new entries since Clear view." : stream.data?.missing ? "This log has not been written yet." : "This log is empty."} />
    </>}
    {panel === 'archives' && <section className="space-y-4 rounded-lg border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Archived logs</h2><p className="text-sm text-muted-foreground">Managed archives from all services. Viewing and exporting verify the checksum.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(loadArchives)}>Refresh archives</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await safeInvoke('open_log_archives'); })}><FolderOpen className="mr-2 h-4 w-4" />Open folder</Button></div></div>
      {!records.length && <p className="text-sm text-muted-foreground">{busy ? 'Loading archives…' : 'No managed archives yet. Use Archive current log to preserve a log.'}</p>}
      <div className="space-y-3">{records.map(record => <article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="font-medium">{labels[record.source] ?? record.source} · {new Date(record.created * 1000).toLocaleString()}</p><p className="text-xs text-muted-foreground break-all">{record.id}.log.gz</p><p className="text-xs text-muted-foreground">{size(record.original_bytes)} original · {size(record.bytes)} compressed</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const text = await safeInvoke<string>('read_log_archive', { id: record.id }); setPreview({ title: record.id, text: text ?? '' }); })}>View</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { if (await safeInvoke<boolean>('export_log_archive', { id: record.id })) setNotice('Archive exported successfully.'); })}>Export</Button><Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => { setConfirmation(''); setDeletion(record); }}>Delete…</Button></div></article>)}</div>
    </section>}
    {panel === 'rotation' && <section className="space-y-4 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">Rotation & retention</h2>
      <p className="text-sm text-muted-foreground">Applies only to managed diagnostic logs and archives. Automatic rotation waits for a safe shutdown of service writers; it never stops your services. Maintenance runs at launch, after service stops, and every five minutes while DevStackBox is open.</p>
      {policy ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => { await safeInvoke('set_log_policy', { value: policy }); setNotice('Log policy saved. Automatic archive deletion follows these limits only while enabled.'); }); }}>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })} /><span>Enable automatic rotation and deletion of old managed archives</span></label>
        <div className="grid gap-4 sm:grid-cols-2">{([{ key: 'rotate_mib', label: 'Rotate at (MiB)', min: 1, max: 1024 }, { key: 'retention_days', label: 'Keep for (days)', min: 1, max: 3650 }, { key: 'per_log', label: 'Maximum archives per log', min: 1, max: 1000 }, { key: 'budget_mib', label: 'Total archive budget (MiB)', min: 10, max: 102400 }] as const).map(field => <label key={field.key} className="space-y-2 text-sm">{field.label}<Input type="number" required min={field.min} max={field.max} step={1} value={policy[field.key]} onChange={e => setPolicy({ ...policy, [field.key]: Number(e.target.value) })} /></label>)}</div>
        <p className="text-sm text-muted-foreground">The earliest retention limit applies. Only recognized closed archives are deleted. Active files can exceed the threshold until their writers stop. Live service rotation is not enabled.</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Save policy</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => { await safeInvoke('run_log_maintenance'); setNotice('Maintenance completed using the saved policy. If automatic rotation is disabled, no files were changed.'); })}>Run saved policy now</Button></div>
      </form> : <p className="text-sm text-muted-foreground">{busy ? 'Loading policy…' : 'Policy unavailable. Return to this panel to retry.'}</p>}
    </section>}
    <Dialog open={deletion !== null} onOpenChange={open => { if (!busy && !open) setDeletion(null); }}><DialogContent><DialogHeader><DialogTitle>{deletion === 'active' ? 'Permanently delete log contents?' : 'Permanently delete this archive?'}</DialogTitle><DialogDescription>{deletion === 'active' ? 'This empties the selected file without creating a backup. Archive it first if you need its history. All writers must be stopped.' : 'This removes the managed archive and its metadata. The active log is not affected.'}</DialogDescription></DialogHeader><label className="space-y-2 text-sm">Type <strong className="break-all">{deleteTarget}</strong> to confirm<Input aria-label="Deletion confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeletion(null)}>Cancel</Button><Button variant="destructive" disabled={busy || confirmation !== deleteTarget} onClick={() => void run(async () => { if (deletion === 'active') { await safeInvoke('delete_log_contents', { id: selected, expected: deleteCursor, confirmation }); await stream.history(); } else if (deletion) { await safeInvoke('delete_log_archive', { id: deletion.id }); await loadArchives(); } setDeletion(null); setNotice('Deletion completed.'); })}>Delete permanently</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={preview !== null} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle className="break-all">{preview?.title}</DialogTitle><DialogDescription>Verified archive · last 512 KiB · read-only</DialogDescription></DialogHeader><pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs">{preview?.text}</pre></DialogContent></Dialog>
  </div>;
}
export default WorkspaceLogViewer;
