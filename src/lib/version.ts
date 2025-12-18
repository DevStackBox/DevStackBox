import packageJson from '../../package.json';

/**
 * Application version from package.json
 * Single source of truth for version display
 */
export const APP_VERSION = packageJson.version;
export const APP_NAME = packageJson.name;
export const APP_DESCRIPTION = packageJson.description;
