import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import en from '../../locales/en.json';
import hi from '../../locales/hi.json';

const resources = {
  en: {
    translation: en
  },
  hi: {
    translation: hi
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi'],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    cleanCode: true,
    debug: false,

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'devstackbox-language'
    },

    interpolation: {
      escapeValue: false // react already does escaping
    }
  });

export default i18n;
