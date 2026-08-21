import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import App from "./App.tsx";
import "./styles/index.css";
import { i18nReady } from "./i18n";
import { scheduleYandexMetrika } from "./analytics/yandexMetrika";

void i18nReady.then(() => {
  const rootElement = document.getElementById("root")!;
  const root = createRoot(rootElement);

  // Commit the first React frame before revealing a production-prerendered root.
  // This prevents crawler HTML from flashing while i18n and route chunks load.
  flushSync(() => root.render(<App />));
  rootElement.removeAttribute("data-prerendered");
  scheduleYandexMetrika();
});
