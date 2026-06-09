import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TAURI_COMMANDS } from "@/lib/commands";
import { ROUTES } from "@/lib/routes";

interface SecurityFinding {
  service: string;
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  recommendation: string;
}

const SERVICE_LABELS: Record<string, string> = {
  php: "PHP",
  apache: "Apache",
  mysql: "MySQL",
};

const SEVERITY_META = {
  error: {
    icon: XCircle,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
    rowClass: "border-l-4 border-l-destructive",
  },
  warning: {
    icon: AlertTriangle,
    badgeClass:
      "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    rowClass: "border-l-4 border-l-yellow-500",
  },
  info: {
    icon: Info,
    badgeClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    rowClass: "border-l-4 border-l-blue-500",
  },
} as const;

function FindingRow({
  finding,
  index,
}: {
  finding: SecurityFinding;
  index: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const meta = SEVERITY_META[finding.severity];
  const Icon = meta.icon;

  const severityLabel = finding.severity === "error"
    ? t("security.severityError", "Error")
    : finding.severity === "warning"
      ? t("security.severityWarning", "Warning")
      : t("security.severityInfo", "Info");

  const configRoute =
    finding.service === "apache"
      ? ROUTES.apacheConfig.path
      : finding.service === "php"
        ? ROUTES.phpConfig.path
        : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`rounded-lg border bg-card ${meta.rowClass} overflow-hidden`}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium text-sm">{finding.title}</span>
        <Badge
          variant="outline"
          className={`text-xs shrink-0 ${meta.badgeClass}`}
        >
          {SERVICE_LABELS[finding.service] ?? finding.service}
        </Badge>
        <Badge
          variant="outline"
          className={`text-xs shrink-0 ${meta.badgeClass}`}
        >
          {severityLabel}
        </Badge>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 flex flex-col gap-2 text-sm border-t border-border/50">
              <p className="text-muted-foreground">{finding.description}</p>
              <div className="rounded bg-muted/50 px-3 py-2">
                <span className="font-semibold text-foreground">{t("security.fix", "Fix")}: </span>
                <span className="text-muted-foreground">
                  {finding.recommendation}
                </span>
              </div>
              {configRoute && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(configRoute)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("security.openConfig", "Open Config")}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SummaryCard({
  label,
  count,
  severity,
}: {
  label: string;
  count: number;
  severity: "error" | "warning" | "info";
}) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-4">
        <Icon className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-2xl font-bold leading-none">{count}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SecurityPage() {
  const { t } = useTranslation();
  const [findings, setFindings] = useState<SecurityFinding[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SecurityFinding[]>(
        TAURI_COMMANDS.security.analyze,
      );
      setFindings(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const errors = findings?.filter((f) => f.severity === "error").length ?? 0;
  const warnings =
    findings?.filter((f) => f.severity === "warning").length ?? 0;
  const infos = findings?.filter((f) => f.severity === "info").length ?? 0;
  const allClear = findings !== null && findings.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("security.title", "Security Analyzer")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("security.description", "Scans PHP, Apache, and MySQL configurations for common security issues.")}
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={loading}>
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          {loading
            ? t("security.scanning", "Scanning...")
            : findings === null
              ? t("security.runScan", "Run Scan")
              : t("security.scanAgain", "Scan Again")}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 pb-4 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {findings !== null && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label={t("security.errors", "Errors")} count={errors} severity="error" />
          <SummaryCard label={t("security.warnings", "Warnings")} count={warnings} severity="warning" />
          <SummaryCard label={t("security.info", "Info")} count={infos} severity="info" />
        </div>
      )}

      {allClear && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 gap-3 text-center"
        >
          <ShieldCheck className="w-12 h-12 text-green-500" />
          <p className="text-lg font-semibold">{t("security.noIssues", "No issues found")}</p>
          <p className="text-sm text-muted-foreground">
            {t("security.noIssuesDesc", "Your PHP, Apache, and MySQL configurations look good.")}
          </p>
        </motion.div>
      )}

      {findings !== null && findings.length > 0 && (
        <div className="space-y-2">
          {findings.map((finding, i) => (
            <FindingRow
              key={`${finding.service}-${i}`}
              finding={finding}
              index={i}
            />
          ))}
        </div>
      )}

      {findings === null && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ShieldAlert className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("security.runScanPrompt", "Click \"Run Scan\" to analyze your service configurations.")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
