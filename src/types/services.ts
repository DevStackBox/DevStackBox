/**
 * Shared type definitions for DevStackBox services
 */

/**
 * Frontend-only presentation states for optimistic UI updates.
 * "starting" and "stopping" are NEVER persisted to cache.
 * "running" and "stopped" are the only real states (derived from Rust).
 */
export type ServiceState =
  | "running"
  | "stopped"
  | "starting" // set optimistically on Start click - not from Rust
  | "stopping" // set optimistically on Stop click - not from Rust
  | "error"; // transient error state - not persisted

export interface ServiceStatus {
  /** Derived presentation state - prefer this over `running`. */
  state: ServiceState;
  /** Kept for backward compat with components not yet migrated. */
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
}

/** Shape returned by Rust commands (running: bool). Maps to ServiceStatus via mapRawStatus(). */
export interface RawServiceStatus {
  running: boolean;
  pid?: number | null;
  port?: number | null;
  version?: string | null;
}

/** Map a Rust response to the frontend ServiceStatus. Only ever produces "running" or "stopped". */
export function mapRawStatus(
  raw: RawServiceStatus | null | undefined,
): ServiceStatus {
  if (!raw) return { state: "stopped", running: false };
  return {
    state: raw.running ? "running" : "stopped",
    running: raw.running,
    pid: raw.pid ?? undefined,
    port: raw.port ?? undefined,
    version: raw.version ?? undefined,
  };
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
