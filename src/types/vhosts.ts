export interface VhostEntry {
  id: string;
  php_version?: string | null;
  domain: string;
  doc_root: string;
  enabled: boolean;
  https: boolean;
  aliases: string[];
  project_root: string;
}
export interface ProjectDiagnostics {
  https: SiteHealth;
  website_status: number | null;
  website_message: string;
  folder_message: string | null;
  configuration_warnings: string[];
}
export interface SiteHealth {
  domain: string;
  enabled: boolean;
  https: boolean;
  trusted: boolean;
  verified: boolean;
  message: string;
  expiry: string | null;
  url: string;
}
export interface HttpsStatus {
  port: number;
  ca_exists: boolean;
  ca_trusted: boolean;
  enabled: boolean;
  sites: SiteHealth[];
  setup_error: string | null;
}
