import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

export function FloatingButtons() {
  const { t } = useTranslation();

  const content = (
    <div
      className="flex flex-col"
      data-floating-buttons
      style={{
        zIndex: 2147483647,
        position: "fixed",
        pointerEvents: "auto",
        gap: "5px",
      }}
    >
      <Button
        asChild
        size="lg"
        className="shadow-lg hover:shadow-xl transition-shadow text-sm md:text-base"
      >
        <a
          href="https://t.me/korotkovsStudio/634"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 whitespace-nowrap"
        >
          <span className="text-lg md:text-xl">₽</span>
          <span className="hidden sm:inline">
            {t("floatingButtons.learnPrices")}
          </span>
          <span className="sm:hidden">{t("floatingButtons.learnPrices")}</span>
        </a>
      </Button>
    </div>
  );

  // Рендерим прямо в <body>, чтобы кнопки не зависели от stacking context/overflow родительских контейнеров
  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}

