import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bug, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { APP_VERSION } from "@/lib/version";
import { URLS } from "@/lib/urls";

interface BugReportDialogProps {
  trigger?: React.ReactNode;
}

export function BugReportDialog({ trigger }: BugReportDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");

  const buildBody = () => {
    const env = [
      `**App version:** v${APP_VERSION}`,
      `**OS:** ${navigator.platform || "Windows"}`,
      `**User agent:** ${navigator.userAgent}`,
    ].join("\n");

    return [
      "### Description",
      description.trim() || "_(please describe the issue)_",
      "",
      "### Steps to reproduce",
      steps.trim() || "_(steps)_",
      "",
      "### Environment",
      env,
    ].join("\n");
  };

  const openIssue = () => {
    const params = new URLSearchParams({
      title: title.trim() || "Bug report",
      body: buildBody(),
      labels: "bug",
    });
    const url = `${URLS.githubNewIssue}?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Bug className="mr-2 h-4 w-4" />
            {t("bugReport.button", "Report a bug")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            {t("bugReport.title", "Report a bug")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "bugReport.description",
              "Opens a pre-filled GitHub issue. No data is sent automatically.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {t("bugReport.titleLabel", "Title")}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(
                "bugReport.titlePlaceholder",
                "Short summary of the issue",
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {t("bugReport.descriptionLabel", "What happened?")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={t(
                "bugReport.descriptionPlaceholder",
                "Describe the bug or unexpected behavior",
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {t("bugReport.stepsLabel", "Steps to reproduce")}
            </label>
            <Textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              placeholder={t(
                "bugReport.stepsPlaceholder",
                "1. Open services\n2. Click start\n3. ...",
              )}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("actions.cancel", "Cancel")}
          </Button>
          <Button onClick={openIssue}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("bugReport.openOnGithub", "Open on GitHub")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
