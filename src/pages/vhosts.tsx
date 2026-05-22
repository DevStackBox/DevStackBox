import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { TAURI_COMMANDS } from "@/lib/commands";

interface VhostEntry {
  domain: string;
  doc_root: string;
  enabled: boolean;
}

export function VhostsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [vhosts, setVhosts] = useState<VhostEntry[]>([]);
  const [hostsEntries, setHostsEntries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hostsLoading, setHostsLoading] = useState<string | null>(null);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [docRoot, setDocRoot] = useState("");
  const [adding, setAdding] = useState(false);

  // Remove dialog
  const [removeTarget, setRemoveTarget] = useState<VhostEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  // Action feedback
  const [actionMsg, setActionMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [v, h] = await Promise.all([
        invoke<VhostEntry[]>(TAURI_COMMANDS.vhosts.list).catch(() => []),
        invoke<string[]>(TAURI_COMMANDS.vhosts.getHostsEntries).catch(() => []),
      ]);
      setVhosts(v ?? []);
      setHostsEntries(h ?? []);
    } finally {
      setLoading(false);
    }
  };

  const isInHosts = (d: string) =>
    hostsEntries.some((e) => e.includes(` ${d}`));

  const showMsg = (type: "ok" | "err", text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 6000);
  };

  const handleAdd = async () => {
    if (!domain.trim() || !docRoot.trim()) return;
    setAdding(true);
    try {
      await invoke(TAURI_COMMANDS.vhosts.add, {
        domain: domain.trim(),
        docRoot: docRoot.trim(),
      });
      showMsg("ok", `Virtual host '${domain.trim()}' added.`);
      setAddOpen(false);
      setDomain("");
      setDocRoot("");
      await loadAll();
    } catch (err) {
      toast({
        title: t("vhosts.addError"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await invoke(TAURI_COMMANDS.vhosts.remove, {
        domain: removeTarget.domain,
      });
      showMsg("ok", `Virtual host '${removeTarget.domain}' removed.`);
      setRemoveTarget(null);
      await loadAll();
    } catch (err) {
      toast({
        title: t("vhosts.removeError"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  };

  const handleToggle = async (entry: VhostEntry) => {
    try {
      await invoke(TAURI_COMMANDS.vhosts.toggle, {
        domain: entry.domain,
        enabled: !entry.enabled,
      });
      await loadAll();
    } catch (err) {
      toast({
        title: "Failed to toggle virtual host",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const handleHostsUpdate = async (d: string, action: "add" | "remove") => {
    setHostsLoading(d + action);
    setActionMsg(null);
    try {
      const msg = await invoke<string>(TAURI_COMMANDS.vhosts.updateHostsEntry, {
        domain: d,
        action,
      });
      showMsg("ok", msg);
      await loadAll();
    } catch (err) {
      showMsg("err", String(err));
    } finally {
      setHostsLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6" />
            {t("vhosts.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("vhosts.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t("vhosts.addVhost")}
          </Button>
        </div>
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

      {/* Virtual hosts table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-4 h-4" />
            Configured Virtual Hosts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vhosts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("vhosts.noVhosts")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Document Root</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hosts File</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vhosts.map((v) => {
                  const inHosts = isInHosts(v.domain);
                  const busyKey = v.domain + (inHosts ? "remove" : "add");
                  const isBusy = hostsLoading === busyKey;
                  return (
                    <TableRow key={v.domain}>
                      <TableCell className="font-mono font-medium">
                        {v.domain}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono max-w-xs truncate">
                        {v.doc_root}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={v.enabled ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => handleToggle(v)}
                        >
                          {v.enabled ? (
                            <>
                              <ToggleRight className="w-3 h-3 mr-1" />
                              {t("vhosts.enabled")}
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-3 h-3 mr-1" />
                              {t("vhosts.disabled")}
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inHosts ? (
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                            <CheckCircle2 className="w-3 h-3" />
                            {t("vhosts.inHosts")}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <XCircle className="w-3 h-3" />
                            {t("vhosts.notInHosts")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {inHosts ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isBusy}
                              onClick={() =>
                                handleHostsUpdate(v.domain, "remove")
                              }
                            >
                              {t("vhosts.removeFromHosts")}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isBusy}
                              onClick={() => handleHostsUpdate(v.domain, "add")}
                              title={t("vhosts.uacWarning")}
                            >
                              {t("vhosts.addToHosts")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setRemoveTarget(v)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Hosts file info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("vhosts.hostsFileSection")}
          </CardTitle>
          <CardDescription>{t("vhosts.hostsFileDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t("vhosts.uacWarning")}</span>
          </div>
          {hostsEntries.length > 0 && (
            <>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground mb-2">
                Current DevStackBox-managed hosts entries:
              </p>
              <div className="font-mono text-xs space-y-1">
                {hostsEntries.map((e) => (
                  <div
                    key={e}
                    className="px-3 py-1.5 bg-muted rounded text-muted-foreground"
                  >
                    {e}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add virtual host dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("vhosts.addVhost")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vhost-domain">{t("vhosts.domainLabel")}</Label>
              <Input
                id="vhost-domain"
                placeholder={t("vhosts.domainPlaceholder")}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <p className="text-xs text-muted-foreground">
                Use a .test or .local suffix (e.g. myapp.test).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vhost-docroot">{t("vhosts.docRootLabel")}</Label>
              <Input
                id="vhost-docroot"
                placeholder={t("vhosts.docRootPlaceholder")}
                value={docRoot}
                onChange={(e) => setDocRoot(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <p className="text-xs text-muted-foreground">
                Full path to the folder Apache will serve (created if missing).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setDomain("");
                setDocRoot("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding || !domain.trim() || !docRoot.trim()}
            >
              {adding ? "Adding..." : t("vhosts.addVhost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("vhosts.confirmRemoveTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget
                ? t("vhosts.confirmRemoveDesc", { domain: removeTarget.domain })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removing..." : t("vhosts.removeVhost")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
