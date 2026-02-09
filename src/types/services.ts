/**
 * Shared type definitions for DevStackBox services
 */

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
}

export interface ServiceInfo extends ServiceStatus {
  uptime?: string;
  memory?: number;
}

export interface PHPVersionInfo {
  version: string;
  status: "installed" | "available" | "downloading";
  path: string;
  is_active: boolean;
  installed: boolean;
  download_url: string;
}

export interface ServiceAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive" | "outline" | "ghost";
}

export type ServiceName = "mysql" | "apache" | "php";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
  service: ServiceName;
}

export interface ConfigFile {
  name: string;
  path: string;
  service: ServiceName;
  content: string;
  syntax: "ini" | "conf" | "json";
}
