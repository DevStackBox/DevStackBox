import type { i18n as I18nInstance } from "i18next";

export const APP_LANGUAGES = ["en", "hi"] as const;
export type AppLanguageCode = (typeof APP_LANGUAGES)[number];

export function getAppLanguageCode(i18n: I18nInstance): AppLanguageCode {
  const resolved = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const base = resolved.split("-")[0]?.toLowerCase();
  if (base === "hi") {
    return "hi";
  }
  return "en";
}
