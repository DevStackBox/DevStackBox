import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Rocket, Server, Database, Code } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "devstackbox.onboarding.completed";

interface OnboardingDialogProps {
  onOpenServices: () => void;
}

export function OnboardingDialog({ onOpenServices }: OnboardingDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setOpen(true);
      }
    } catch {
      // localStorage unavailable - skip onboarding silently.
    }
  }, []);

  const markCompleted = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const handleStartAll = async () => {
    if (!isTauri()) {
      markCompleted();
      onOpenServices();
      return;
    }
    setStarting(true);
    try {
      await safeInvoke(TAURI_COMMANDS.services.startMysql);
      await safeInvoke(TAURI_COMMANDS.services.startApache);
      toast({
        title: t("onboarding.startedTitle", "Services started"),
        description: t(
          "onboarding.startedDescription",
          "Apache and MySQL are running. Open http://localhost to see your site.",
        ),
      });
    } catch (err) {
      toast({
        title: t("onboarding.startFailedTitle", "Could not start services"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setStarting(false);
      markCompleted();
      onOpenServices();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) markCompleted();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-2xl">
            {t("onboarding.title", "Welcome to DevStackBox")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              "onboarding.description",
              "A portable local PHP development environment with Apache, MySQL, and PHP 8.3 ready to go.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center">
            <Server className="h-5 w-5 text-orange-500" />
            <span className="text-xs font-medium">Apache</span>
            <span className="text-[10px] text-muted-foreground">
              {t("onboarding.bundled", "Bundled")}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center">
            <Database className="h-5 w-5 text-blue-500" />
            <span className="text-xs font-medium">MySQL</span>
            <span className="text-[10px] text-muted-foreground">
              {t("onboarding.bundled", "Bundled")}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center">
            <Code className="h-5 w-5 text-purple-500" />
            <span className="text-xs font-medium">PHP 8.3</span>
            <span className="text-[10px] text-muted-foreground">
              {t("onboarding.bundled", "Bundled")}
            </span>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t(
            "onboarding.callToAction",
            "Start all services now, or explore the dashboard first.",
          )}
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            onClick={markCompleted}
            disabled={starting}
          >
            {t("onboarding.exploreFirst", "Explore first")}
          </Button>
          <Button onClick={handleStartAll} disabled={starting}>
            {starting
              ? t("onboarding.starting", "Starting...")
              : t("onboarding.startAll", "Start all services")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
