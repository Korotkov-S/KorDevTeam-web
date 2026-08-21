import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/index.css";
import { i18nReady } from "./i18n";
import { scheduleYandexMetrika } from "./analytics/yandexMetrika";

void i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
  scheduleYandexMetrika();
});
