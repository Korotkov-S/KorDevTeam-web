import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export function LanguageToggle() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const current = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase();
    const isRu = current === "ru" || current.startsWith("ru-");
    const newLang = isRu ? "en" : "ru";
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent hover:border-primary/50 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      aria-label={`Switch to ${(i18n.resolvedLanguage || i18n.language || "en").startsWith("ru") ? "English" : "Russian"}`}
    >
      <Globe className="w-5 h-5" />
      
      {/* Эффект свечения при hover */}
      <div className="absolute inset-0 rounded-lg bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Индикатор текущего языка */}
      <span className="absolute -bottom-1 -right-1 text-xs font-semibold bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] px-0.5">
        {(i18n.resolvedLanguage || i18n.language || "en").startsWith("ru") ? "RU" : "EN"}
      </span>
    </button>
  );
}
