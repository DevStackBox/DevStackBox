import { useWorkspaceQuery } from "@/hooks/use-workspace-query";
import { workspaceCache } from "@/lib/workspace-cache";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeInvoke, openExternalUrl } from "@/lib/tauri";
import type { VhostEntry, ProjectDiagnostics } from "@/types/vhosts";
type PhpVersion = { version: string; installed: boolean; is_active: boolean };

export function ProjectDetailsPage() {
  const { projectId } = useParams();
  const sitesQuery = useWorkspaceQuery('project:sites', async () => (await safeInvoke<VhostEntry[]>('list_vhosts')) ?? [], 30000);
  const site = sitesQuery.data?.find(item => item.id === projectId) ?? null;
  const versionsQuery = useWorkspaceQuery('project:php', async () => { const result = await safeInvoke<PhpVersion[]>('get_php_versions'); return Array.isArray(result) ? result : []; }, 300000, true, false);
  const healthKey = 'project:health:' + projectId;
  const healthQuery = useWorkspaceQuery(healthKey, async () => await safeInvoke<ProjectDiagnostics>('get_project_diagnostics', { projectId }), 60000, !!site, false);
  const diagnostics = healthQuery.data ?? null;
  const phpVersions = (versionsQuery.data ?? []).filter(version => version.installed);
  const [draft, setDraft] = useState<VhostEntry | null>(null);
  const [aliases, setAliases] = useState("");
  const loading = sitesQuery.data === undefined;
  const refreshing = sitesQuery.refreshing || healthQuery.refreshing || versionsQuery.refreshing;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projectLogs, setProjectLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const [phpVersion, setPhpVersion] = useState("");
  const adopted = useRef<string | null>(null);
  const adoptedAliases = useRef('');
  const adoptedProject = useRef<string | undefined>(undefined);
  const dirty = !!draft && !!site && (JSON.stringify(draft) !== adopted.current || aliases !== adoptedAliases.current || phpVersion !== (site.php_version ?? ''));
  useEffect(() => {
    if (!site) return;
    if (adoptedProject.current === projectId && draft && dirty) return;
    const next = { ...site, project_root: site.project_root || site.doc_root };
    adopted.current = JSON.stringify(next);
    adoptedAliases.current = site.aliases.join(', ');
    adoptedProject.current = projectId;
    setDraft(next);
    setAliases(site.aliases.join(', '));
    setPhpVersion(site.php_version ?? '');
  }, [site]);
  const load = async (resetDraft = true) => {
    setError('');
    await Promise.all([sitesQuery.refresh(), versionsQuery.refresh(), healthQuery.refresh()]);
    if (resetDraft) {
      const next = workspaceCache.snapshot<VhostEntry[]>('project:sites').data?.find(item => item.id === projectId);
      if (next) { const updated = { ...next, project_root: next.project_root || next.doc_root }; adopted.current = JSON.stringify(updated); adoptedAliases.current = next.aliases.join(', '); setDraft(updated); setAliases(next.aliases.join(', ')); setPhpVersion(next.php_version ?? ''); }
    }
  };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !site) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sitesQuery.refresh();
      const latest = workspaceCache.snapshot<VhostEntry[]>('project:sites');
      const current = latest.data?.find(item => item.id === projectId);
      if (latest.error || !current || JSON.stringify({ ...current, project_root: current.project_root || current.doc_root }) !== adopted.current) {
        throw new Error('Project configuration changed or could not be checked. Your edits are preserved. Reset changes to load the current configuration before saving.');
      }
      await safeInvoke("add_vhost", {
        domain: draft.domain,
        docRoot: draft.doc_root,
        projectRoot: draft.project_root || draft.doc_root,
        https: draft.https,
        previousDomain: site.domain,
        aliases: aliases
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setNotice("Website settings saved. Project files were kept in place.");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const https = diagnostics?.https;
  const canOpen = site?.enabled && https && (!site.https || (https.verified && !healthQuery.stale));
  const blocked = busy || loading;
  return (
    <div className="w-full min-w-0 space-y-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-all">
            {site?.domain || "Project details"}
          </h1>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {site?.project_root || site?.doc_root}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canOpen || blocked}
            onClick={() =>
              void openExternalUrl(https!.url).catch((e) => setError(String(e)))
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open website
          </Button>
          <Button
            variant="outline"
            disabled={!site || blocked}
            onClick={() =>
              void safeInvoke("open_project_folder", {
                path: site!.project_root || site!.doc_root,
              }).catch((e) => setError(String(e)))
            }
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Open folder
          </Button>
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => void load(false)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Check health
          </Button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-4 text-sm break-words"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {notice}
        </p>
      )}
      {sitesQuery.updatedAt && <p role="status" className="text-xs text-muted-foreground">{refreshing ? 'Updating in background… ' : ''}Configuration last checked: {new Date(sitesQuery.updatedAt).toLocaleTimeString()}. {healthQuery.updatedAt ? 'Health last checked: ' + new Date(healthQuery.updatedAt).toLocaleTimeString() : 'Health not checked.'} {healthQuery.stale ? 'Health needs rechecking.' : ''}</p>}
      {(sitesQuery.error || healthQuery.error || versionsQuery.error) && <p role="alert" className="text-sm text-destructive">Could not refresh. Previous results may be outdated. {sitesQuery.error || healthQuery.error || versionsQuery.error}</p>}
      {sitesQuery.data && !site && <p role="alert">Project not found. Return to Projects and refresh the list.</p>}
      {dirty && site && JSON.stringify({ ...site, project_root: site.project_root || site.doc_root }) !== adopted.current && <p role="alert" className="text-sm">This project changed since editing began. Your edits are preserved; reset to load the current configuration before saving.</p>}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Checking project configuration and website…
        </p>
      )}
      {site && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="space-y-2 rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Website response</h2>
              <p className="text-sm" role="status">
                {diagnostics?.website_message || "Not checked"}
              </p>
              {diagnostics?.folder_message && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {diagnostics.folder_message}
                </p>
              )}
            </section>
            <section className="space-y-2 rounded-xl border bg-card p-5">
              <h2 className="font-semibold">HTTPS / SSL</h2>
              <p className="text-sm" role="status">
                {https?.message || "Not checked"}
              </p>
              <p className="text-xs text-muted-foreground">
                Certificate trust and the website response are checked
                separately.
              </p>
              <Link
                className="inline-block text-sm underline underline-offset-4"
                to="/services/apache/ssl"
              >
                Manage local HTTPS trust
              </Link>
            </section>
          </div>
          {!!diagnostics?.configuration_warnings.length && (
            <section
              role="alert"
              className="space-y-2 rounded-xl border border-amber-500 p-5"
            >
              <h2 className="font-semibold">Configuration needs review</h2>
              {diagnostics.configuration_warnings.map((warning) => (
                <p key={warning} className="text-sm break-words">
                  {warning}
                </p>
              ))}
              <Link
                to="/services/apache/config"
                className="inline-block text-sm underline underline-offset-4"
              >
                Inspect Apache configuration
              </Link>
            </section>
          )}
          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Server logs</h2>
            <p className="text-sm text-muted-foreground">
              Apache logs are shared across sites. PHP logs are shared by sites using the same runtime.
              {site.php_version ? ` This project uses the PHP ${site.php_version} log.` : " This project uses the global PHP log."}
              {" "}Old or empty logs do not prove that the website is healthy. Reproduce the error and refresh; custom logging settings may write elsewhere.
            </p>
            <Button variant="outline" disabled={blocked || logsLoading} onClick={async () => {
              setLogsLoading(true);
              try {
                const results = await Promise.allSettled([
                  safeInvoke<string>("get_service_logs", { service: "apache" }),
                  safeInvoke<string>("get_service_logs", { service: "php", phpVersion: site.php_version || null }),
                ]);
                setProjectLogs(results.map((result, i) => `${i === 0 ? "Apache" : "PHP"}\n${result.status === "fulfilled" ? result.value || "No logs available." : String(result.reason)}`).join("\n\n"));
              } finally { setLogsLoading(false); }
            }}>{logsLoading ? "Reading logs…" : "Read / refresh server logs"}</Button>
            {projectLogs !== null && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs" aria-label="Project server logs">{projectLogs}</pre>}
            <Link to="/services/apache/logs" className="block text-sm underline underline-offset-4">Open Apache logs</Link>
          </section>
          {draft && (
            <form
              onSubmit={save}
              className="space-y-5 rounded-xl border bg-card p-5"
            >
              <div>
                <h2 className="text-lg font-semibold">Website settings</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect an existing folder anywhere on this computer. Files
                  stay in their original location.
                </p>
              </div>
              <fieldset disabled={blocked} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="project-folder">Project folder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="project-folder"
                      required
                      value={draft.project_root}
                      onChange={(e) =>
                        setDraft({ ...draft, project_root: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const path = await safeInvoke<string>(
                            "choose_project_folder",
                          );
                          if (path)
                            setDraft(
                              (current) =>
                                current && { ...current, project_root: path },
                            );
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-root">Document root</Label>
                  <Input
                    id="project-root"
                    required
                    value={draft.doc_root}
                    onChange={(e) =>
                      setDraft({ ...draft, doc_root: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    The folder Apache serves. For Laravel, choose public/ so
                    .env and application files remain private. Changing the
                    project folder does not change this field.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="project-hostname">Hostname</Label>
                    <Input
                      id="project-hostname"
                      required
                      value={draft.domain}
                      onChange={(e) =>
                        setDraft({ ...draft, domain: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project-aliases">
                      Aliases (comma-separated)
                    </Label>
                    <Input
                      id="project-aliases"
                      value={aliases}
                      onChange={(e) => setAliases(e.target.value)}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.https}
                    onChange={(e) =>
                      setDraft({ ...draft, https: e.target.checked })
                    }
                  />
                  Enable trusted HTTPS
                </label>
                <p className="text-sm text-muted-foreground">
                  Use .test hostnames. Windows may ask for permission to update
                  hostname mappings. Saving restarts Apache if it is running.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">
                    {busy ? "Applying settings…" : "Save website settings"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      adopted.current = JSON.stringify({ ...site, project_root: site.project_root || site.doc_root });
                      adoptedAliases.current = site.aliases.join(', ');
                      setDraft({
                        ...site,
                        project_root: site.project_root || site.doc_root,
                      });
                      setAliases(site.aliases.join(", "));
                    }}
                  >
                    Reset changes
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
          <section className="space-y-2 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">PHP & tools</h2>
            <p className="text-sm text-muted-foreground">
              Current setting:{" "}
              {site.php_version
                ? `PHP ${site.php_version}`
                : `Global default${phpVersions.find((v) => v.is_active) ? ` (PHP ${phpVersions.find((v) => v.is_active)!.version})` : ""}`}
              . Select an installed PHP version for this project's HTTP and
              HTTPS requests. This is the saved setting, not a measurement of the PHP runtime serving a live request.
            </p>
            {site.php_version &&
              !phpVersions.some((v) => v.version === site.php_version) && (
                <p role="alert" className="text-sm text-destructive">
                  PHP {site.php_version} is no longer installed. Install it in
                  PHP settings or apply another version below.
                </p>
              )}
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  await safeInvoke("set_project_php_version", {
                    projectId,
                    version: phpVersion || null,
                  });
                  setNotice(
                    "Project PHP setting saved. Existing terminals keep their current environment.",
                  );
                  await load(false);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Label htmlFor="project-php-version">Project PHP version</Label>
              <div className="flex flex-wrap gap-2">
                <select
                  id="project-php-version"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={blocked}
                  value={phpVersion}
                  onChange={(e) => setPhpVersion(e.target.value)}
                >
                  <option value="">Use global default</option>
                  {phpVersions.map((v) => (
                    <option key={v.version} value={v.version}>
                      PHP {v.version}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={blocked}>
                  {busy ? "Applying…" : "Apply PHP version"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Only installed versions appear. Install additional versions in
                PHP settings, then return here. Applying restarts Apache if it
                is running. Other projects keep their own PHP settings.
              </p>
            </form>
            <Link
              className="inline-block text-sm underline underline-offset-4"
              to="/services/php/versions"
            >
              Manage installed PHP versions
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
