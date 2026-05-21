import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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
        className={`w-4 h-4 shrink-0 ${ok ? "text-green-500" : "text-muted-foreground"}`}
      />
      <span className="text-sm font-medium">{label}</span>
      {detail && (
        <span className="text-sm text-muted-foreground ml-auto">{detail}</span>
      )}
    </div>
  );
}

export function SslPage() {
  const [status, setStatus] = useState<SslStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchStatus = async () => {
    try {
      const s = await invoke<SslStatus>(TAURI_COMMANDS.ssl.getStatus);
      setStatus(s);
    } catch {
      // status unavailable - stays null
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setLoading(true);
    setActionMsg(null);
    try {
      const msg = await fn();
      setActionMsg({ type: "ok", text: msg });
      await fetchStatus();
    } catch (err) {
      setActionMsg({ type: "err", text: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () =>
    run(() => invoke<string>(TAURI_COMMANDS.ssl.generateCert));

  const handleEnable = () =>
    run(() => invoke<string>(TAURI_COMMANDS.ssl.enable));

  const handleDisable = () =>
    run(() => invoke<string>(TAURI_COMMANDS.ssl.disable));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="w-6 h-6" />
            HTTPS / SSL
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Local Root CA signs certificates for localhost and future virtual hosts.
            Trust the CA once in Windows - all generated certs are automatically trusted.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={loading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
            actionMsg.type === "ok"
              ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
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
            Current Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {status ? (
            <>
              <StatusRow
                ok={status.ca_exists}
                label="Local Root CA generated (DevStackBox Local CA)"
              />
              <Separator />
              <StatusRow
                ok={status.cert_exists}
                label="localhost certificate signed by CA"
                detail={
                  status.cert_expiry
                    ? `Expires: ${status.cert_expiry}`
                    : undefined
                }
              />
              <Separator />
              <StatusRow
                ok={status.enabled}
                label="SSL enabled in Apache config"
              />
              {status.ca_exists && (
                <>
                  <Separator />
                  <div className="pt-1 space-y-1">
                    <p className="text-xs text-muted-foreground font-mono break-all">
                      CA:   {status.ca_path}
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
            <p className="text-sm text-muted-foreground">Loading status...</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileBadge className="w-4 h-4" />
              Generate CA + Certificate
            </CardTitle>
            <CardDescription className="text-xs">
              Creates a Local Root CA (DevStackBox Local CA) then signs a
              10-year localhost certificate with it. Re-run to regenerate
              the localhost cert without touching the CA.
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
              Generate
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Enable SSL
            </CardTitle>
            <CardDescription className="text-xs">
              Adds mod_ssl and an HTTPS VirtualHost (port 443) to Apache config.
              Generates a certificate if one does not exist yet.
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
              Enable
              {status?.enabled && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Active
                </Badge>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LockOpen className="w-4 h-4" />
              Disable SSL
            </CardTitle>
            <CardDescription className="text-xs">
              Removes the SSL Include from httpd.conf. Certificate files are
              kept so SSL can be re-enabled without regenerating.
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
              Disable
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Trust instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Trust the Root CA in Windows (one-time)</CardTitle>
          <CardDescription className="text-xs">
            Import the CA certificate once. Every certificate DevStackBox generates
            - for localhost and future virtual hosts - is then trusted automatically.
            No more browser warnings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
              Open{" "}
              <span className="font-mono text-foreground">certmgr.msc</span>{" "}
              (Windows Certificate Manager).
            </li>
            <li>
              Navigate to{" "}
              <span className="font-semibold text-foreground">
                Trusted Root Certification Authorities &gt; Certificates
              </span>
              .
            </li>
            <li>
              Right-click and choose{" "}
              <span className="font-semibold text-foreground">
                All Tasks &gt; Import...
              </span>
            </li>
            <li>
              Browse to{" "}
              <span className="font-mono text-foreground">ca.crt</span>{" "}
              (path shown below) and complete the import wizard.
            </li>
            <li>
              Restart your browser. All DevStackBox HTTPS sites will be trusted
              without any further action.
            </li>
          </ol>
          {status?.ca_path && (
            <p className="text-xs font-mono text-muted-foreground break-all border rounded px-2 py-1 bg-muted/40">
              {status.ca_path}
            </p>
          )}
          {!status?.ca_path && (
            <p className="text-xs text-muted-foreground">
              Generate the CA first to see its path.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
