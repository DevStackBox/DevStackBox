import { useState, useEffect } from "react";
import { safeInvoke } from "@/lib/tauri";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  FileBadge,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TAURI_COMMANDS } from "@/lib/commands";

interface SslStatus {
  ca_exists: boolean;
  ca_trusted: boolean;
  ca_path: string;
  cert_exists: boolean;
  enabled: boolean;
  cert_expiry: string | null;
  cert_path: string;
  key_path: string;
}

function StatusRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon
        className={`w-4 h-4 shrink-0 ${ok ? "text-primary" : "text-muted-foreground"}`}
      />
      <span className="text-sm font-medium">{label}</span>
      {detail && (
        <span className="text-sm text-muted-foreground ml-auto">{detail}</span>
      )}
    </div>
  );
}

export function SslPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SslStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchStatus = async () => {
    try {
      const s = await safeInvoke<SslStatus>(TAURI_COMMANDS.ssl.getStatus);
      setStatus(s);
    } catch {
      // status unavailable - stays null
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const run = async (fn: () => Promise<string | null>) => {
    setLoading(true);
    setActionMsg(null);
    try {
      const msg = await fn();
      if (msg) {
        setActionMsg({ type: "ok", text: msg });
      }
      await fetchStatus();
    } catch (err) {
      setActionMsg({ type: "err", text: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () =>
    run(() => safeInvoke<string>(TAURI_COMMANDS.ssl.generateCert));

  const handleEnable = () =>
    run(() => safeInvoke<string>(TAURI_COMMANDS.ssl.enable));

  const handleDisable = () =>
    run(() => safeInvoke<string>(TAURI_COMMANDS.ssl.disable));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={loading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          {t("ssl.refresh", "Refresh")}
        </Button>
      </div>

      <div className="flex items-center justify-between rounded border p-3 text-sm">
        <span>{status?.ca_trusted ? "Local certificate is trusted by Windows" : "Trust the local certificate to use HTTPS without browser warnings"}</span>
        <Button size="sm" variant="outline" disabled={loading || !status?.ca_exists || status.ca_trusted} onClick={() => {
          if (window.confirm("Trust the DevStackBox local certificate authority for your Windows account? Only certificates issued by your local DevStackBox CA will be trusted.")) void run(() => safeInvoke<string>(TAURI_COMMANDS.ssl.trustCa));
        }}>Trust local certificate</Button>
      </div>
      {/* Action feedback */}
      {actionMsg && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
            actionMsg.type === "ok"
              ? "border-primary/30 bg-primary/10 text-primary dark:text-primary"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {actionMsg.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <pre className="whitespace-pre-wrap font-sans">{actionMsg.text}</pre>
        </motion.div>
      )}

      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" />
            {t("ssl.currentStatus", "Current Status")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {status ? (
            <>
              <StatusRow
                ok={status.ca_exists}
                label={t("ssl.caGenerated", "Local Root CA generated (DevStackBox Local CA)")}
              />
              <Separator />
              <StatusRow
                ok={status.cert_exists}
                label={t("ssl.certSigned", "localhost certificate signed by CA")}
                detail={
                  status.cert_expiry
                    ? `${t("ssl.expires", "Expires")}: ${status.cert_expiry}`
                    : undefined
                }
              />
              <Separator />
              <StatusRow
                ok={status.enabled}
                label={t("ssl.sslEnabled", "SSL enabled in Apache config")}
              />
              {status.ca_exists && (
                <>
                  <Separator />
                  <div className="pt-1 space-y-1">
                    <p className="text-xs text-muted-foreground font-mono break-all">
                      CA: {status.ca_path}
                    </p>
                    {status.cert_exists && (
                      <p className="text-xs text-muted-foreground font-mono break-all">
                        Cert: {status.cert_path}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("ssl.loadingStatus", "Loading status...")}</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileBadge className="w-4 h-4" />
              {t("ssl.generateTitle", "Generate CA + Certificate")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("ssl.generateDesc", "Creates a Local Root CA (DevStackBox Local CA) then signs a 10-year localhost certificate with it. Re-run to regenerate the localhost cert without touching the CA.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto pt-2">
            <Button
              className="w-full"
              variant="outline"
              disabled={loading}
              onClick={handleGenerate}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileBadge className="w-4 h-4 mr-2" />
              )}
              {t("ssl.generate", "Generate")}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {t("ssl.enableTitle", "Enable SSL")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("ssl.enableDesc", "Adds mod_ssl and an HTTPS VirtualHost (port 443) to Apache config. Generates a certificate if one does not exist yet.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto pt-2">
            <Button
              className="w-full"
              disabled={loading || status?.enabled === true}
              onClick={handleEnable}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              {t("ssl.enable", "Enable")}
              {status?.enabled && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {t("ssl.active", "Active")}
                </Badge>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LockOpen className="w-4 h-4" />
              {t("ssl.disableTitle", "Disable SSL")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("ssl.disableDesc", "Removes the SSL Include from httpd.conf. Certificate files are kept so SSL can be re-enabled without regenerating.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto pt-2">
            <Button
              className="w-full"
              variant="outline"
              disabled={loading || status?.enabled === false}
              onClick={handleDisable}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LockOpen className="w-4 h-4 mr-2" />
              )}
              {t("ssl.disable", "Disable")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("ssl.trustTitle", "Trust the local certificate")}</CardTitle>
          <CardDescription className="text-xs">
            {status?.ca_trusted
              ? "HTTPS certificates issued by DevStackBox are trusted for your Windows account."
              : "Trust the DevStackBox local CA once to remove browser certificate warnings for your local sites."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" disabled={loading || !status?.ca_exists || status.ca_trusted} onClick={() => {
            if (window.confirm("Trust the DevStackBox local certificate authority for your Windows account? Only certificates issued by your local DevStackBox CA will be trusted.")) void run(() => safeInvoke<string>(TAURI_COMMANDS.ssl.trustCa));
          }}>{status?.ca_trusted ? "Trusted for this Windows account" : "Trust local certificate"}</Button>
          {status?.ca_path && <p className="text-xs font-mono text-muted-foreground break-all border rounded px-2 py-1 bg-muted/40">{status.ca_path}</p>}
          {!status?.ca_exists && <p className="text-xs text-muted-foreground">Generate the certificate before trusting the local CA.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
