import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeInvoke } from "@/lib/tauri";
import { useToast } from "@/hooks/use-toast";

type XamppDetection = {
  path: string;
  hasHtdocs: boolean;
  htdocsFileCount: number;
};

export function SettingsXamppImportPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [detections, setDetections] = useState<XamppDetection[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const list = await safeInvoke<XamppDetection[]>("detect_xampp_installations");
    setDetections(list ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importHtdocs = async (path: string) => {
    setLoading(true);
    try {
      const result = await safeInvoke<{ copiedFiles: number; destination: string }>(
        "import_from_xampp",
        { xamppRoot: path, copyHtdocs: true },
      );
      toast({
        title: "Import complete",
        description: `Copied ${result?.copiedFiles ?? 0} files to ${result?.destination ?? "www"}.`,
      });
    } catch (e) {
      toast({
        title: "Import failed",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from XAMPP</CardTitle>
        <CardDescription>
          Copy projects from XAMPP htdocs into DevStackBox www. Existing files with the same name are
          skipped. Export MySQL from XAMPP phpMyAdmin and import in DevStackBox for databases.
          {" "}{t("xamppImport.connectAlternative", "To keep project files where they are, connect their folders from Projects instead of copying.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
          Scan again
        </Button>
        {detections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No XAMPP folder found at C:\xampp.</p>
        ) : (
          detections.map((item) => (
            <div key={item.path} className="rounded-lg border border-border p-4">
              <p className="font-medium">{item.path}</p>
              <p className="text-sm text-muted-foreground">
                htdocs: {item.hasHtdocs ? `${item.htdocsFileCount}+ entries` : "not found"}
              </p>
              <Button
                type="button"
                className="mt-3"
                disabled={!item.hasHtdocs || loading}
                onClick={() => void importHtdocs(item.path)}
              >
                Copy htdocs to www
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
