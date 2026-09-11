import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';

export const i18nReady = i18n.use(initReactI18next).init({
  lng: "ru",
  fallbackLng: "ru",
  supportedLngs: ["ru"],
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// Keep <html lang=""> in sync for accessibility/SEO.
i18n.on("languageChanged", () => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = "ru";
  }
});

export default i18n;
