import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { ROUTES } from "@/lib/routes";

const DISMISS_KEY = "devstackbox.security.rootPasswordPromptDismissed";

interface SecurityFinding {
  service: string;
  severity: string;
  title: string;
}

export function RootPasswordPrompt() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    void (async () => {
      try {
        const findings = await safeInvoke<SecurityFinding[]>(
          TAURI_COMMANDS.security.analyze,
        );
        const emptyRoot = findings?.some(
          (f) =>
            f.service === "mysql" &&
            f.severity === "warning" &&
            f.title.toLowerCase().includes("root"),
        );
        if (emptyRoot) setOpen(true);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {t("security.rootPasswordTitle", "Set a MySQL root password")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              "security.rootPasswordPrompt",
              "MySQL root has no password. For local dev this is common, but setting one improves security if others use this PC.",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={dismiss}>
            {t("common.later", "Later")}
          </Button>
          <Button
            onClick={() => {
              dismiss();
              navigate(ROUTES.databasesUsers.path);
            }}
          >
            {t("security.openMysqlUsers", "Open MySQL Users")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
