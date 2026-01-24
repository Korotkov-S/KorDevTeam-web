import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ru from './locales/ru.json';
import en from './locales/en.json';

const resources = {
  ru: {
    translation: ru,
  },
  en: {
    translation: en,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['ru', 'en'],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    cleanCode: true,
    
    detection: {
      // Определяем язык автоматически
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React уже экранирует
    },

    react: {
      useSuspense: false,
    },
  });

// Keep <html lang=""> in sync for accessibility/SEO.
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = (lng || "").split("-")[0] || "en";
  }
});

export default i18n;
