import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Globe, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { safeInvoke, openExternalUrl, isTauri } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { VhostEntry, HttpsStatus } from "@/types/vhosts";

type Project = { name: string; path: string };
const samePath = (a: string, b: string) =>
  a.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() ===
  b.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
export function SitesWorkspace({ advanced = false }: { advanced?: boolean }) {
  const { i18n } = useTranslation();
  const text = (en: string, hi: string) =>
    i18n.language.startsWith("hi") ? hi : en;
  const navigate = useNavigate();
  const [sites, setSites] = useState<VhostEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [health, setHealth] = useState<HttpsStatus | null>(null);
  const [hosts, setHosts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [configurationWarnings, setConfigurationWarnings] = useState<string[]>(
    [],
  );
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [root, setRoot] = useState("");
  const [domain, setDomain] = useState("");
  const [aliases, setAliases] = useState("");
  const [https, setHttps] = useState(true);
  const [createName, setCreateName] = useState("");
  const load = useCallback(async () => {
    setChecking(true);
    setHealth(null);
    try {
      const [s, p, h] = await Promise.all([
        safeInvoke<VhostEntry[]>("list_vhosts"),
        safeInvoke<Project[]>("list_www_projects"),
        safeInvoke<string[]>("get_hosts_entries"),
      ]);
      setSites(s ?? []);
      setProjects(p ?? []);
      setHosts(h ?? []);
      const warnings = await safeInvoke<string[]>(
        "get_site_configuration_warnings",
      );
      setConfigurationWarnings(warnings ?? []);
      setHealth(await safeInvoke<HttpsStatus>("get_ssl_status"));
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function selectFolder(path: string) {
    setFolder(path);
    setRoot(path);
    if (!domain)
      setDomain(
        (path.split(/[\\/]/).pop() ?? "project")
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-") + ".test",
      );
    try {
      setRoot(
        (await safeInvoke<string>("suggest_document_root", { path })) ?? path,
      );
    } catch (e) {
      setError(String(e));
    }
  }
  function connect(project?: Project, site?: VhostEntry) {
    setError("");
    setNotice("");
    setPrevious(site?.domain ?? null);
    setCreateName("");
    setFolder(site?.project_root || site?.doc_root || project?.path || "");
    setRoot(site?.doc_root || project?.path || "");
    setDomain(
      site?.domain ||
        (project
          ? project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-") + ".test"
          : ""),
    );
    setAliases(site?.aliases?.join(", ") ?? "");
    setHttps(site?.https ?? true);
    setOpen(true);
    if (project && !site)
      void safeInvoke<string>("suggest_document_root", { path: project.path })
        .then((r) => r && setRoot(r))
        .catch((e) => setError(String(e)));
  }
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setHealth(null);
    try {
      await action();
      setNotice(message);
      await load();
    } catch (e) {
      setError(String(e));
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await safeInvoke("add_vhost", {
        domain,
        docRoot: root,
        projectRoot: folder,
        https,
        aliases: aliases
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        previousDomain: previous,
      });
      setOpen(false);
      setNotice(
        text(
          "Site configuration applied. Check the verification result below.",
          "साइट कॉन्फ़िगरेशन लागू है। नीचे जाँच का परिणाम देखें।",
        ),
      );
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const known = new Set(
    sites
      .filter((s) => s.enabled)
      .flatMap((s) => [s.domain, ...(s.aliases ?? [])])
      .map((s) => s.toLowerCase()),
  );
  const orphaned = [
    ...new Set(
      hosts
        .flatMap((l) => l.split("#")[0].trim().split(/\s+/).slice(1))
        .filter((n) => !known.has(n.toLowerCase())),
    ),
  ];
  const unconnected = projects.filter(
    (p) => !sites.some((s) => samePath(s.project_root || s.doc_root, p.path)),
  );
  const filtered = sites.filter((s) =>
    `${s.domain} ${s.doc_root}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {advanced
              ? text("Virtual hosts", "वर्चुअल होस्ट")
              : text("Projects", "प्रोजेक्ट")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {text(
              "Connect a folder, choose a .test hostname, and manage HTTPS in one place.",
              "फ़ोल्डर जोड़ें, .test नाम चुनें और HTTPS प्रबंधित करें।",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy || checking}
            onClick={() => void load()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {text("Check", "जाँच")}
          </Button>
          <Button disabled={busy || !isTauri()} onClick={() => connect()}>
            <Plus className="mr-2 h-4 w-4" />
            {text("Add project / site", "प्रोजेक्ट / साइट जोड़ें")}
          </Button>
        </div>
      </div>
      {!isTauri() && (
        <p className="rounded-lg border p-3 text-sm">
          {text(
            "Preview mode. Open the desktop app to manage real projects.",
            "पूर्वावलोकन। प्रोजेक्ट प्रबंधित करने के लिए डेस्कटॉप ऐप खोलें।",
          )}
        </p>
      )}
      {!open && error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm break-words"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {notice}
        </p>
      )}
      {configurationWarnings.length > 0 && (
        <section
          role="alert"
          className="space-y-2 rounded-xl border border-amber-500 p-4"
        >
          <h3 className="font-semibold">Configuration needs review</h3>
          {configurationWarnings.map((warning) => (
            <p className="text-sm break-words" key={warning}>
              {warning}
            </p>
          ))}
          <Button
            variant="outline"
            onClick={() => navigate("/services/apache/config")}
          >
            Inspect Apache configuration
          </Button>
        </section>
      )}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <p className="font-medium">
            localhost{" "}
            <span className="ml-2 text-xs text-muted-foreground">
              {text("System site", "सिस्टम साइट")}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {checking
              ? text("Checking HTTPS…", "HTTPS की जाँच…")
              : (health?.sites[0]?.message ??
                text("Not checked", "जाँच नहीं हुई"))}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/services/apache/ssl")}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {text("Manage HTTPS", "HTTPS प्रबंधित करें")}
        </Button>
      </section>
      <Input
        aria-label={text("Search projects", "प्रोजेक्ट खोजें")}
        placeholder={text(
          "Search hostname or folder…",
          "होस्टनाम या फ़ोल्डर खोजें…",
        )}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="grid grid-cols-1 gap-4">
        {filtered.map((site) => {
          const status = health?.sites.find((h) => h.domain === site.domain);
          return (
            <section
              key={site.domain}
              className="min-w-0 space-y-3 rounded-xl border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold break-all">
                  <button
                    className="text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
                    onClick={() =>
                      navigate(`/projects/${encodeURIComponent(site.id)}`)
                    }
                  >
                    {site.domain}
                  </button>
                </h3>
                <Globe className="h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
              <p className="text-sm break-all">{site.doc_root}</p>
              <p className="text-xs text-muted-foreground">
                {site.php_version
                  ? `PHP ${site.php_version}`
                  : text("PHP: global default", "PHP: वैश्विक डिफ़ॉल्ट")}
              </p>
              <p
                className={`text-sm ${status?.verified ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
                role="status"
              >
                {checking
                  ? text("Checking…", "जाँच जारी…")
                  : (status?.message ?? text("Not checked", "जाँच नहीं हुई"))}
              </p>
              {site.aliases?.length > 0 && (
                <p className="text-xs break-all">{site.aliases.join(", ")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    !site.enabled || !status || (site.https && !status.verified)
                  }
                  onClick={() =>
                    void openExternalUrl(status!.url).catch((e) =>
                      setError(String(e)),
                    )
                  }
                >
                  {text("Open site", "साइट खोलें")}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void safeInvoke("open_project_folder", {
                      path: site.project_root || site.doc_root,
                    }).catch((e) => setError(String(e)))
                  }
                >
                  {text("Open folder", "फ़ोल्डर खोलें")}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    navigate(`/projects/${encodeURIComponent(site.id)}`)
                  }
                >
                  {text("Manage project", "प्रोजेक्ट प्रबंधित करें")}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        safeInvoke("toggle_vhost", {
                          domain: site.domain,
                          enabled: !site.enabled,
                        }),
                      text("Site updated", "साइट अपडेट हुई"),
                    )
                  }
                >
                  {site.enabled
                    ? text("Disable", "बंद करें")
                    : text("Enable", "चालू करें")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        text(
                          `Disconnect ${site.domain}? Project files are kept. Windows may request permission to remove its hostname.`,
                          `${site.domain} डिस्कनेक्ट करें? प्रोजेक्ट फ़ाइलें सुरक्षित रहेंगी।`,
                        ),
                      )
                    )
                      void run(
                        () =>
                          safeInvoke("remove_vhost", { domain: site.domain }),
                        text(
                          "Site disconnected. Files preserved.",
                          "साइट डिस्कनेक्ट हुई। फ़ाइलें सुरक्षित हैं।",
                        ),
                      );
                  }}
                >
                  {text("Disconnect", "डिस्कनेक्ट")}
                </Button>
              </div>
            </section>
          );
        })}
        {unconnected
          .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
          .map((p) => (
            <section
              key={p.path}
              className="space-y-3 rounded-xl border border-dashed p-5"
            >
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground break-all">
                {p.path}
              </p>
              <p className="text-sm">
                {text(
                  "Folder found · Not connected to a site",
                  "फ़ोल्डर मिला · साइट से जुड़ा नहीं है",
                )}
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => connect(p)}
              >
                {text("Connect site", "साइट जोड़ें")}
              </Button>
            </section>
          ))}
      </div>
      {!sites.length && !projects.length && !checking && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {text(
            "Add your first project to create its local web address.",
            "स्थानीय वेब पता बनाने के लिए पहला प्रोजेक्ट जोड़ें।",
          )}
        </p>
      )}
      {orphaned.length > 0 && (
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="font-medium">
            {text(
              "Hostname mappings without an active site",
              "सक्रिय साइट के बिना होस्टनाम",
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {text(
              "These entries remain in the managed Windows hosts block. Connect a site with that name, or remove only the mapping.",
              "ये प्रविष्टियाँ Windows hosts में हैं। इसी नाम से साइट जोड़ें या मैपिंग हटाएँ।",
            )}
          </p>
          {orphaned.map((n) => (
            <div key={n} className="flex items-center justify-between gap-3">
              <code>{n}</code>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      text(
                        `Remove only the managed mapping for ${n}?`,
                        `${n} की मैपिंग हटाएँ?`,
                      ),
                    )
                  )
                    void run(
                      () =>
                        safeInvoke("update_hosts_entry", {
                          domain: n,
                          action: "remove",
                        }),
                      text("Mapping removed", "मैपिंग हटी"),
                    );
                }}
              >
                {text("Remove mapping", "मैपिंग हटाएँ")}
              </Button>
            </div>
          ))}
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {previous
                ? text("Edit site", "साइट संपादित करें")
                : text("Connect a project", "प्रोजेक्ट जोड़ें")}
            </DialogTitle>
            <DialogDescription>
              {text(
                "Choose what Apache serves. HTTPS and hostname mapping are applied together.",
                "Apache का फ़ोल्डर चुनें। HTTPS और होस्टनाम साथ लागू होंगे।",
              )}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={save}>
            <fieldset disabled={busy} className="space-y-4">
              {!previous && (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {text(
                      "Create a new empty project",
                      "नया खाली प्रोजेक्ट बनाएँ",
                    )}
                  </summary>
                  <div className="mt-3 flex gap-2">
                    <Input
                      aria-label="New project name"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="my-project"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!createName}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const path = await safeInvoke<string>(
                            "create_project_folder",
                            { name: createName },
                          );
                          if (path) await selectFolder(path);
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {text("Create folder", "फ़ोल्डर बनाएँ")}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {text(
                      "Creates files immediately in www. Cancelling site setup keeps the folder.",
                      "www में फ़ाइलें तुरंत बनेंगी। साइट रद्द करने पर फ़ोल्डर रहेगा।",
                    )}
                  </p>
                </details>
              )}
              <div className="space-y-2">
                <Label htmlFor="site-folder">
                  {text("Project folder", "प्रोजेक्ट फ़ोल्डर")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="site-folder"
                    required
                    value={folder}
                    onChange={(e) => {
                      setFolder(e.target.value);
                      setRoot(e.target.value);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const p = await safeInvoke<string>(
                          "choose_project_folder",
                        );
                        if (p) await selectFolder(p);
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {text("Browse", "चुनें")}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-root">
                  {text("Document root", "वेब रूट")}
                </Label>
                <Input
                  id="site-root"
                  required
                  value={root}
                  onChange={(e) => setRoot(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {text(
                    "For Laravel and similar frameworks, serve public/, not the folder containing .env.",
                    "Laravel जैसे फ़्रेमवर्क के लिए public/ चुनें, .env वाला फ़ोल्डर नहीं।",
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-domain">
                  {text("Hostname", "होस्टनाम")}
                </Label>
                <Input
                  id="site-domain"
                  required
                  placeholder="my-project.test"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
              <details>
                <summary className="cursor-pointer text-sm">
                  {text("Aliases", "अतिरिक्त नाम")}
                </summary>
                <Input
                  className="mt-2"
                  aria-label="Hostname aliases"
                  placeholder="www.my-project.test"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {text(
                    "Comma-separated .test names. Each mapping may request Windows permission.",
                    "अल्पविराम से अलग .test नाम। Windows अनुमति माँग सकता है।",
                  )}
                </p>
              </details>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={https}
                  onChange={(e) => setHttps(e.target.checked)}
                />
                {text("Enable trusted HTTPS", "विश्वसनीय HTTPS चालू करें")}
              </label>
              {https && !health?.ca_trusted && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {text(
                    "Local trust is not ready. Complete setup on the HTTPS page before connecting this site.",
                    "स्थानीय ट्रस्ट तैयार नहीं है। पहले HTTPS पृष्ठ पर सेटअप पूरा करें।",
                  )}
                </p>
              )}
              <p className="rounded-lg bg-muted p-3 text-sm break-words">
                {https ? "https" : "http"}://{domain || "my-project.test"}
                {https && health?.port && health.port !== 443
                  ? `:${health.port}`
                  : ""}
                /<br />
                {text(
                  "Windows may request administrator permission to map the hostname. Apache restarts if running.",
                  "होस्टनाम के लिए Windows अनुमति माँग सकता है। चल रहा Apache पुनः शुरू होगा।",
                )}
              </p>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive break-words">
                {error}
              </p>
            )}
            {busy && (
              <p role="status" className="text-sm">
                {text(
                  "Applying hostname, certificate and Apache configuration…",
                  "होस्टनाम, प्रमाणपत्र और Apache लागू हो रहे हैं…",
                )}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {text("Cancel", "रद्द करें")}
              </Button>
              <Button
                disabled={busy || (https && !health?.ca_trusted)}
                type="submit"
              >
                {text("Apply site", "साइट लागू करें")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
