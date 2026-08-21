import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

type AppLanguage = "ru" | "en";

const localeLoaders: Record<AppLanguage, () => Promise<Record<string, unknown>>> = {
  ru: () => import("./locales/ru.json").then((module) => module.default),
  en: () => import("./locales/en.json").then((module) => module.default),
};

const localePromises = new Map<AppLanguage, Promise<Record<string, unknown>>>();

function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  const language = String(value || "").toLowerCase().split("-")[0];
  return language === "ru" || language === "en" ? language : null;
}

function detectInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "ru";
  let storedLanguage: string | null = null;
  try {
    storedLanguage = window.localStorage.getItem("i18nextLng");
  } catch {
    // Storage can be disabled by privacy settings; browser preferences remain usable.
  }

  return (
    normalizeLanguage(storedLanguage) ||
    normalizeLanguage(window.navigator.language) ||
    normalizeLanguage(document.documentElement.lang) ||
    "ru"
  );
}

function loadLocale(language: AppLanguage) {
  const cached = localePromises.get(language);
  if (cached) return cached;
  const promise = localeLoaders[language]();
  localePromises.set(language, promise);
  return promise;
}

const initialLanguage = detectInitialLanguage();

export const i18nReady = loadLocale(initialLanguage).then((translation) =>
  i18n.use(initReactI18next).init({
    lng: initialLanguage,
    resources: {
      [initialLanguage]: { translation },
    },
    fallbackLng: initialLanguage,
    supportedLngs: ["ru", "en"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    cleanCode: true,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  }),
);

export async function changeAppLanguage(language: AppLanguage) {
  if (!i18n.hasResourceBundle(language, "translation")) {
    const translation = await loadLocale(language);
    i18n.addResourceBundle(language, "translation", translation, true, true);
  }

  try {
    window.localStorage.setItem("i18nextLng", language);
  } catch {
    // The language still changes for the current session when storage is unavailable.
  }
  await i18n.changeLanguage(language);
}

// Keep <html lang=""> in sync for accessibility/SEO.
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = (lng || "").split("-")[0] || "en";
  }
});

export default i18n;
