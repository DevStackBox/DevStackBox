import { useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { TerminalPanel } from "@/components/terminal-panel";
import { Button } from "@/components/ui/button";
import { Plus, Terminal, Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TabSession {
  id: string;
  label: string;
  initialCommand?: string;
}

function makeSessionId() {
  return Math.random().toString(36).slice(2, 10);
}

export function TerminalPage() {
  const { t } = useTranslation();
  const baseId = useId();

  const [tabs, setTabs] = useState<TabSession[]>([
    { id: `${baseId}-1`, label: t("terminal.shell", "Shell") },
  ]);
  const [activeTab, setActiveTab] = useState(`${baseId}-1`);

  const addTab = (label?: string, initialCommand?: string) => {
    const id = makeSessionId();
    setTabs((prev) => [
      ...prev,
      { id, label: label ?? t("terminal.shell", "Shell"), initialCommand },
    ]);
    setActiveTab(id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTab === id && next.length > 0) {
        setActiveTab(next[next.length - 1].id);
      }
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4 h-full"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">
          {t("terminal.title", "Terminal")}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => addTab(t("terminal.shell", "Shell"))}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("terminal.newShell", "New Shell")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              addTab(t("terminal.mysql", "MySQL CLI"), "mysql -u root")
            }
          >
            <Database className="mr-2 h-4 w-4" />
            {t("terminal.mysqlCli", "MySQL CLI")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addTab(t("terminal.php", "PHP CLI"), "php -a")}
          >
            <Terminal className="mr-2 h-4 w-4" />
            {t("terminal.phpCli", "PHP CLI")}
          </Button>
        </div>
      </div>

      {tabs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center space-y-3">
            <Terminal className="mx-auto h-10 w-10 opacity-30" />
            <p>{t("terminal.noTabs", "No terminal sessions open.")}</p>
            <Button onClick={() => addTab()}>
              <Plus className="mr-2 h-4 w-4" />
              {t("terminal.newShell", "New Shell")}
            </Button>
          </div>
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col flex-1 min-h-0"
        >
          <TabsList className="justify-start h-auto flex-wrap gap-1 bg-transparent p-0 border-b rounded-none pb-0">
            {tabs.map((tab) => (
              <div key={tab.id} className="flex items-center">
                <TabsTrigger
                  value={tab.id}
                  className="rounded-t-md rounded-b-none border-b-0 text-xs"
                >
                  {tab.label}
                </TabsTrigger>
                {tabs.length > 1 && (
                  <button
                    className="ml-1 text-muted-foreground hover:text-foreground text-xs px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    aria-label="Close tab"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="flex-1 mt-0 rounded-md border overflow-hidden"
              style={{ minHeight: 400 }}
            >
              <TerminalPanel
                sessionId={tab.id}
                initialCommand={tab.initialCommand}
                className="h-full"
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </motion.div>
  );
}
