// Single source of truth for Tauri command names.
// Keep this in sync with docs/TAURI_COMMANDS.md and src-tauri/src/lib.rs.
// No raw command string should appear anywhere else in src/.

export const TAURI_COMMANDS = {
  system: {
    checkBinaries: "check_binaries",
    debugPaths: "debug_paths",
    debugInstallation: "debug_installation",
    stopAllServices: "stop_all_services",
    testApacheConfig: "test_apache_config",
    createDirectoryStructure: "create_directory_structure",
  },
  services: {
    getApacheStatus: "get_apache_status",
    getMysqlStatus: "get_mysql_status",
    getPhpStatus: "get_php_status",
    startMysql: "start_mysql",
    stopMysql: "stop_mysql",
    startApache: "start_apache",
    stopApache: "stop_apache",
    toggleApache: "toggle_apache",
    toggleMysql: "toggle_mysql",
    togglePhp: "toggle_php",
    getServiceLogs: "get_service_logs",
    backupMysqlDatabase: "backup_mysql_database",
    openPhpTerminal: "open_php_terminal",
  },
  php: {
    getVersions: "get_php_versions",
    switchVersion: "switch_php_version",
    downloadVersion: "download_php_version",
  },
  config: {
    read: "read_config",
    update: "update_config",
    backup: "backup_config",
    listBackups: "list_config_backups",
    restoreBackup: "restore_config_backup",
  },
  tray: {
    showMainWindow: "show_main_window",
    hideToTray: "hide_to_tray",
    quitApp: "quit_app",
  },
} as const;
