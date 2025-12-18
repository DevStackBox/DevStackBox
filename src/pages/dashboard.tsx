import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ServiceManager, type ServiceStatus } from "@/components/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  TrendingUp, 
  Server, 
  Database, 
  Code, 
  ExternalLink,
  Settings,
  Bell
} from "lucide-react";

interface DashboardPageProps {
  onOpenPHPVersionSelector: () => void;
  onPageChange: (page: string) => void;
  currentPhpVersion: string;
}

export function DashboardPage({ 
  onOpenPHPVersionSelector, 
  onPageChange, 
  currentPhpVersion 
}: DashboardPageProps) {
  const { t } = useTranslation();
  const [serviceStats, setServiceStats] = useState({
    runningServices: 0,
    totalServices: 2,
    uptime: "0m"
  });
  const uptimeStartRef = useRef<Date | null>(null);

  const formatUptime = (start: Date, now: Date) => {
    const diffMs = now.getTime() - start.getTime();
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
  };

  const handleStatusesChange = (statuses: {
    apache: ServiceStatus;
    mysql: ServiceStatus;
    php: ServiceStatus;
  }) => {
    const runningCount = [statuses.apache.running, statuses.mysql.running].filter(Boolean).length;

    if (runningCount === 0) {
      uptimeStartRef.current = null;
      setServiceStats(prev => ({
        ...prev,
        runningServices: 0,
        uptime: "0m"
      }));
      return;
    }

    if (!uptimeStartRef.current) {
      uptimeStartRef.current = new Date();
    }

    setServiceStats(prev => ({
      ...prev,
      runningServices: runningCount,
      uptime: uptimeStartRef.current ? formatUptime(uptimeStartRef.current, new Date()) : "0m"
    }));
  };

  const handleServiceToggle = (service: string, status: boolean) => {
    console.log(`Service ${service} ${status ? 'started' : 'stopped'}`);
    // ServiceManager will trigger handleStatusesChange after toggling
  };

  const quickActions = [
    {
      id: "open-apache",
      label: t("quickActions.openApache", "Open Apache"),
      description: t("quickActions.openApacheDesc", "View your local website"),
      icon: Server,
      color: "text-orange-500",
      action: () => window.open("http://localhost", "_blank")
    },
    {
      id: "open-phpmyadmin",
      label: t("quickActions.openPhpMyAdmin", "Open phpMyAdmin"),
      description: t("quickActions.openPhpMyAdminDesc", "Manage your databases"),
      icon: Database,
      color: "text-blue-500",
      action: () => window.open("http://localhost/phpmyadmin", "_blank")
    },
    {
      id: "change-php",
      label: t("quickActions.changePHP", "Change PHP Version"),
      description: t("quickActions.changePHPDesc", "Switch between PHP versions"),
      icon: Code,
      color: "text-purple-500",
      action: onOpenPHPVersionSelector
    },
    {
      id: "view-services",
      label: t("quickActions.manageServices", "Manage Services"),
      description: t("quickActions.manageServicesDesc", "Full service management"),
      icon: Settings,
      color: "text-gray-500",
      action: () => onPageChange("services")
    }
  ];

  useEffect(() => {
    if (serviceStats.runningServices === 0 || !uptimeStartRef.current) {
      return;
    }

    const interval = setInterval(() => {
      const start = uptimeStartRef.current;
      if (!start) {
        return;
      }

      setServiceStats(prev => ({
        ...prev,
        uptime: formatUptime(start, new Date())
      }));
    }, 60000);

    return () => clearInterval(interval);
  }, [serviceStats.runningServices]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("pages.dashboard.title", "Dashboard")}
          </h1>
          <p className="text-muted-foreground">
            {t("pages.dashboard.description", "Your development environment at a glance")}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Bell className="mr-2 h-4 w-4" />
            {t("actions.notifications", "Notifications")}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard.stats.runningServices", "Running Services")}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {serviceStats.runningServices}/{serviceStats.totalServices}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.stats.servicesActive", "services active")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard.stats.uptime", "Uptime")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{serviceStats.uptime}</div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.stats.sinceLastStart", "since last start")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard.stats.phpVersion", "PHP Version")}
            </CardTitle>
            <Code className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentPhpVersion}</div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.stats.currentActive", "currently active")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("dashboard.stats.status", "Status")}
            </CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Badge 
                variant={serviceStats.runningServices === 2 ? "default" : serviceStats.runningServices === 1 ? "secondary" : "outline"}
                className={
                  serviceStats.runningServices === 2 
                    ? "bg-green-500 hover:bg-green-600" 
                    : serviceStats.runningServices === 1
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "bg-gray-500 hover:bg-gray-600"
                }
              >
                {serviceStats.runningServices === 2
                  ? t("status.operational", "Operational") 
                  : serviceStats.runningServices === 1
                  ? t("status.partiallyRunning", "Partially Running")
                  : t("status.offline", "Offline")
                }
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services Overview - Compact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5" />
            <span>{t("dashboard.services.title", "Services")}</span>
          </CardTitle>
          <CardDescription>
            {t("dashboard.services.description", "Quick overview and control of your development services")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServiceManager
            compact={true}
            onServiceToggle={handleServiceToggle}
            onOpenPHPVersionSelector={onOpenPHPVersionSelector}
            currentPhpVersion={currentPhpVersion}
            onStatusesChange={handleStatusesChange}
          />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <ExternalLink className="h-5 w-5" />
            <span>{t("dashboard.quickActions.title", "Quick Actions")}</span>
          </CardTitle>
          <CardDescription>
            {t("dashboard.quickActions.description", "Common tasks and shortcuts")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Button
                  onClick={action.action}
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-center space-y-2 w-full"
                >
                  <action.icon className={`h-6 w-6 ${action.color}`} />
                  <div className="text-center">
                    <div className="font-medium">{action.label}</div>
                    <div className="text-xs text-muted-foreground">{action.description}</div>
                  </div>
                </Button>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default DashboardPage;
