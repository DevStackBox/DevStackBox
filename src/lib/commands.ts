export const TAURI_COMMANDS = {
  services: {
    getApacheStatus: "get_apache_status",
    getMysqlStatus: "get_mysql_status",
    getPhpStatus: "get_php_status",
    toggleApache: "toggle_apache",
    toggleMysql: "toggle_mysql",
    togglePhp: "toggle_php",
    getServiceLogs: "get_service_logs",
    backupMysqlDatabase: "backup_mysql_database",
    openPhpTerminal: "open_php_terminal",
  },
} as const;
