import { useEffect, type ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
  data,
  type MetaFunction,
} from "react-router";
import { MotionConfig } from "motion/react";
import { buildRouteMeta } from "./server/seo/metadata";
import { documentHeaders } from "./server/http/cacheHeaders";
import { chunkRecoveryScript } from "./lib/chunkRecovery";
import "./i18n";
import { Footer } from "./components/Footer";
import { FloatingButtons } from "./components/FloatingButtons";
import { Header } from "./components/Header";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./styles/index.css";

declare const __RELEASE_SHA__: string;
export function loader() { return data({ releaseSha: __RELEASE_SHA__ }, { headers: documentHeaders }); }
export { headers } from "./server/http/cacheHeaders";
export const meta: MetaFunction = ({ error, location }) => buildRouteMeta({ pathname: location.pathname,
  title: isRouteErrorResponse(error) && error.status === 404 ? "Страница не найдена" : "Не удалось загрузить страницу",
  description: "Вернитесь на главную страницу или попробуйте обновить страницу позже.", indexable: false, kind: "page" });

export function Layout({ children }: { children: ReactNode }) {
  const rootData = useRouteLoaderData<typeof loader>("root");
  useEffect(() => { document.documentElement.dataset.hydrated = "true"; }, []);
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {rootData?.releaseSha && <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript(rootData.releaseSha) }} />}
        <noscript><style dangerouslySetInnerHTML={{ __html: `[style*="opacity:0"], [style*="opacity: 0"] { opacity: 1 !important; transform: none !important; }` }} /></noscript>
      </head>
      <body>
        <MotionConfig reducedMotion="user"><ThemeProvider>{children}</ThemeProvider></MotionConfig>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <div
      className="min-h-screen bg-background text-foreground overflow-hidden"
      style={{ maxWidth: "100vw" }}
    >
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
        <div className="absolute top-0 -left-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-blob" />
        <div className="absolute top-0 -right-48 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-48 left-1/2 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl animate-blob animation-delay-4000" />
      </div>
      <div className="relative z-10">
        <Header />
        <main>
          <Outlet />
        </main>
        <Footer />
        <FloatingButtons />
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.status === 404
      ? "Страница не найдена"
      : "Не удалось загрузить страницу"
    : "Не удалось загрузить страницу";

  return (
    <main className="min-h-screen bg-background px-6 py-32 text-foreground">
      <h1 className="text-3xl font-bold">{message}</h1>
      <p className="mt-4">Попробуйте обновить страницу или вернитесь на главную.</p>
      <a href="/" className="mt-6 inline-block underline">На главную</a>
    </main>
  );
}
