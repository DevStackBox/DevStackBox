import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { safeInvoke, openExternalUrl, isTauri } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import type { HttpsStatus } from "@/types/vhosts";
export function SslPage() {
  const { i18n } = useTranslation();
  const text = (en: string, hi: string) =>
    i18n.language.startsWith("hi") ? hi : en;
  const [status, setStatus] = useState<HttpsStatus | null>(null);
  const [port, setPort] = useState(443);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setChecking(true);
    setStatus(null);
    try {
      const next = await safeInvoke<HttpsStatus>("get_ssl_status");
      setStatus(next);
      setPort(next?.port ?? 443);
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(command: string, args?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setStatus(null);
    try {
      await safeInvoke(command, args);
    } catch (e) {
      setError(String(e));
    } finally {
      await load();
      setBusy(false);
    }
  }
  const ready =
    !!status?.sites.filter((s) => s.enabled && s.https).length &&
    status.sites.filter((s) => s.enabled && s.https).every((s) => s.verified);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {text("Local HTTPS", "स्थानीय HTTPS")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {text(
              "Windows trust, site certificates, and live connections checked together.",
              "Windows ट्रस्ट, प्रमाणपत्र और लाइव कनेक्शन की एक साथ जाँच।",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy || checking}
          onClick={() => void load()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {text("Check again", "फिर जाँचें")}
        </Button>
      </div>
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex gap-3">
          {ready ? (
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
          ) : (
            <TriangleAlert className="h-6 w-6 text-amber-600" />
          )}
          <div>
            <h3 className="font-semibold" role="status">
              {busy
                ? text("Setting up HTTPS…", "HTTPS सेटअप जारी…")
                : checking
                  ? text("Checking…", "जाँच जारी…")
                  : ready
                    ? text(
                        "Trusted HTTPS is working",
                        "विश्वसनीय HTTPS काम कर रहा है",
                      )
                    : text("HTTPS needs attention", "HTTPS पर ध्यान दें")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {text(
                "Certificates are unique to this Windows account and computer. A configured certificate is not marked ready until the live HTTPS check succeeds.",
                "प्रमाणपत्र इस Windows खाते और कंप्यूटर के लिए हैं। लाइव जाँच सफल होने पर ही तैयार दिखेगा।",
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || checking || !isTauri()}
            onClick={() => {
              if (
                status?.ca_trusted ||
                window.confirm(
                  text(
                    "Set up a private local certificate authority and trust it for this Windows account? It can issue certificates trusted by your browsers. Keep its private key on this computer.",
                    "इस Windows खाते के लिए स्थानीय प्रमाणपत्र प्राधिकरण बनाकर विश्वसनीय करें? उसकी निजी कुंजी इसी कंप्यूटर पर रखें।",
                  ),
                )
              )
                void action("enable_ssl", { port });
            }}
          >
            {text("Set up / repair HTTPS", "HTTPS सेटअप / सुधार")}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !isTauri()}
            onClick={() => void action("start_apache")}
          >
            {text("Start Apache", "Apache शुरू करें")}
          </Button>
        </div>
        {status && (
          <p className="text-sm">
            {text("Windows trust:", "Windows ट्रस्ट:")}{" "}
            {status.ca_trusted
              ? text("Installed for this account", "इस खाते के लिए स्थापित")
              : text("Missing", "अनुपलब्ध")}{" "}
            ·{" "}
            {text("Apache HTTPS configuration:", "Apache HTTPS कॉन्फ़िगरेशन:")}{" "}
            {status.enabled
              ? text("Enabled", "चालू")
              : text("Not enabled", "बंद")}
          </p>
        )}
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm break-words"
        >
          {error}
        </p>
      )}
      {status?.setup_error && (
        <p role="alert" className="rounded-lg border p-3 text-sm break-words">
          {text("Last automatic setup:", "पिछला स्वचालित सेटअप:")}{" "}
          {status.setup_error}
        </p>
      )}
      <div className="space-y-3">
        {status?.sites.map((site) => (
          <section key={site.domain} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">{site.domain}</h3>
                <p
                  className={`mt-1 text-sm break-words ${site.verified ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  {site.message}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!site.verified}
                onClick={() =>
                  void openExternalUrl(site.url).catch((e) =>
                    setError(String(e)),
                  )
                }
              >
                {text("Open HTTPS site", "HTTPS साइट खोलें")}
              </Button>
            </div>
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {text("Certificate details", "प्रमाणपत्र विवरण")}
              </summary>
              <p className="mt-2">
                {text("Expires:", "समाप्ति:")}{" "}
                {site.expiry ?? text("No certificate", "प्रमाणपत्र नहीं")}
              </p>
              <p>
                {text(
                  "Live verification checks Windows trust, hostname, the served certificate and the correct virtual host.",
                  "लाइव जाँच Windows ट्रस्ट, नाम, प्रस्तुत प्रमाणपत्र और सही होस्ट जाँचती है।",
                )}
              </p>
            </details>
          </section>
        ))}
      </div>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {text("Advanced", "उन्नत")}
        </summary>
        <label className="mt-3 flex items-center gap-3 text-sm">
          {text("HTTPS port", "HTTPS पोर्ट")}
          <input
            aria-label="HTTPS port"
            className="w-24 rounded border bg-background p-2"
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <span>
            {text(
              "Apply with Set up / repair HTTPS",
              "सेटअप / सुधार से लागू करें",
            )}
          </span>
        </label>
        <p className="my-3 text-sm text-muted-foreground">
          {text(
            "Disabling HTTPS affects localhost and all HTTPS sites. Certificates and project files are kept. Browser policy may require a restart after trust setup; no security checks are bypassed.",
            "HTTPS बंद करने से सभी साइट प्रभावित होंगी। प्रमाणपत्र और फ़ाइलें सुरक्षित रहेंगी। ट्रस्ट सेटअप के बाद ब्राउज़र पुनः शुरू करना पड़ सकता है।",
          )}
        </p>
        <Button
          variant="outline"
          disabled={busy || !status?.enabled}
          onClick={() => {
            if (
              window.confirm(
                text(
                  "Disable HTTPS for localhost and every project?",
                  "localhost और सभी प्रोजेक्ट के लिए HTTPS बंद करें?",
                ),
              )
            )
              void action("disable_ssl");
          }}
        >
          {text("Disable HTTPS", "HTTPS बंद करें")}
        </Button>
      </details>
    </div>
  );
}
export default SslPage;
