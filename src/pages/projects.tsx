import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, RefreshCw } from "lucide-react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { TAURI_COMMANDS } from "@/lib/commands";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface WwwProject {
  name: string;
  path: string;
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<WwwProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      if (!isTauri()) {
        setProjects([]);
        return;
      }
      const list = await safeInvoke<WwwProject[]>(
        TAURI_COMMANDS.system.listWwwProjects,
      );
      setProjects(list ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("navigation.projects", "Projects")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "projects.description",
              "Folders in your www directory - add vhosts to serve them on custom domains.",
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("actions.refresh", "Refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-5 w-5" />
              {t("projects.emptyTitle", "No projects yet")}
            </CardTitle>
            <CardDescription>
              {t(
                "projects.emptyDescription",
                "Create a folder under www/ to see it listed here.",
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.path}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <CardDescription className="font-mono text-xs break-all">
                  {p.path}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "projects.hint",
                    "Use Virtual Hosts to map a .test domain to this folder.",
                  )}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProjectsPage;
