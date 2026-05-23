import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { safeInvoke } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { RefreshCw, Plus, Trash2, KeyRound } from "lucide-react";

interface MySQLUser {
  user: string;
  host: string;
  has_password: boolean;
}

export function MySQLUsersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [users, setUsers] = useState<MySQLUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newHost, setNewHost] = useState("localhost");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Change password dialog
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<MySQLUser | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [updatingPwd, setUpdatingPwd] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MySQLUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await safeInvoke<MySQLUser[]>(
        TAURI_COMMANDS.services.listMysqlUsers,
      );
      setUsers(result ?? []);
    } catch (err) {
      toast({
        title: t("mysql.users.loadError", "Failed to load users"),
        description: `${err}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newUsername.trim()) return;
    setCreating(true);
    try {
      const msg = await safeInvoke<string>(
        TAURI_COMMANDS.services.createMysqlUser,
        {
          username: newUsername.trim(),
          host: newHost.trim() || "localhost",
          password: newPassword,
        },
      );
      toast({ title: msg ?? t("mysql.users.created", "User created") });
      setCreateOpen(false);
      setNewUsername("");
      setNewHost("localhost");
      setNewPassword("");
      loadUsers();
    } catch (err) {
      toast({
        title: t("mysql.users.createError", "Failed to create user"),
        description: `${err}`,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const msg = await safeInvoke<string>(
        TAURI_COMMANDS.services.dropMysqlUser,
        {
          username: deleteTarget.user,
          host: deleteTarget.host,
        },
      );
      toast({ title: msg ?? t("mysql.users.dropped", "User dropped") });
      setDeleteTarget(null);
      loadUsers();
    } catch (err) {
      toast({
        title: t("mysql.users.dropError", "Failed to drop user"),
        description: `${err}`,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSetPassword = async () => {
    if (!pwdTarget) return;
    setUpdatingPwd(true);
    try {
      const msg = await safeInvoke<string>(
        TAURI_COMMANDS.services.setMysqlUserPassword,
        {
          username: pwdTarget.user,
          host: pwdTarget.host,
          password: newPwd,
        },
      );
      toast({ title: msg ?? t("mysql.users.pwdUpdated", "Password updated") });
      setPwdOpen(false);
      setPwdTarget(null);
      setNewPwd("");
      loadUsers();
    } catch (err) {
      toast({
        title: t("mysql.users.pwdError", "Failed to update password"),
        description: `${err}`,
        variant: "destructive",
      });
    } finally {
      setUpdatingPwd(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={loadUsers}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          {t("actions.refresh", "Refresh")}
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("mysql.users.addUser", "Add User")}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mysql.users.username", "Username")}</TableHead>
              <TableHead>{t("mysql.users.host", "Host")}</TableHead>
              <TableHead>{t("mysql.users.password", "Password")}</TableHead>
              <TableHead className="text-right">
                {t("actions.actions", "Actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-8"
                >
                  {t(
                    "mysql.users.noUsers",
                    "No users found. Is MySQL running?",
                  )}
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={`${u.user}@${u.host}`}>
                <TableCell className="font-mono font-medium">
                  {u.user}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {u.host}
                </TableCell>
                <TableCell>
                  {u.has_password ? (
                    <Badge variant="secondary">
                      {t("mysql.users.hasPassword", "Set")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t("mysql.users.noPassword", "None")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPwdTarget(u);
                        setNewPwd("");
                        setPwdOpen(true);
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(u)}
                      disabled={u.user === "root"}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create user dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("mysql.users.createTitle", "Create MySQL User")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("mysql.users.username", "Username")}</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="myuser"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>{t("mysql.users.host", "Host")}</Label>
              <Input
                value={newHost}
                onChange={(e) => setNewHost(e.target.value)}
                placeholder="localhost"
              />
            </div>
            <div className="space-y-2">
              <Label>
                {t("mysql.users.passwordOptional", "Password (optional)")}
              </Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t(
                  "mysql.users.leaveBlank",
                  "Leave blank for no password",
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t("actions.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newUsername.trim()}
            >
              {creating
                ? t("actions.creating", "Creating...")
                : t("mysql.users.addUser", "Add User")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set password dialog */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("mysql.users.setPassword", "Set Password")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pwdTarget?.user}@{pwdTarget?.host}
            </p>
            <div className="space-y-2">
              <Label>{t("mysql.users.newPassword", "New Password")}</Label>
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder={t(
                  "mysql.users.leaveBlank",
                  "Leave blank for no password",
                )}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPwdOpen(false)}
              disabled={updatingPwd}
            >
              {t("actions.cancel", "Cancel")}
            </Button>
            <Button onClick={handleSetPassword} disabled={updatingPwd}>
              {updatingPwd
                ? t("actions.saving", "Saving...")
                : t("actions.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("mysql.users.confirmDelete", "Drop User?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "mysql.users.confirmDeleteDesc",
                "This will permanently drop the MySQL user. This action cannot be undone.",
              )}{" "}
              <span className="font-mono font-medium">
                {deleteTarget?.user}@{deleteTarget?.host}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("actions.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting
                ? t("actions.deleting", "Dropping...")
                : t("mysql.users.dropUser", "Drop User")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
