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
  useLocation,
  data,
  type HeadersArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "react-router";
import { MotionConfig } from "motion/react";
import { buildRouteMeta } from "./server/seo/metadata";
import { documentHeaders } from "./server/http/cacheHeaders";
import { chunkRecoveryScript } from "./lib/chunkRecovery";
import { isAdminPath } from "./lib/adminPath";
import { adminHeaders, requestCspNonce } from "./routes/admin/headers";
import "./i18n";
import { PublicFooter } from "./components/public/PublicFooter";
import { PublicHeader } from "./components/public/PublicHeader";
import { ConsentBanner } from "./components/public/ConsentBanner";
import { AnalyticsScripts } from "./components/AnalyticsScripts";
import { ConsentProvider, ConsentShell } from "./contexts/ConsentContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./styles/index.css";

declare const __RELEASE_SHA__: string;
export function loader({ request }: LoaderFunctionArgs) {
  const admin = isAdminPath(new URL(request.url).pathname);
  const cspNonce = admin ? requestCspNonce(request) : null;
  return data({ releaseSha: __RELEASE_SHA__, cspNonce }, { headers: admin ? adminHeaders(cspNonce) : documentHeaders });
}
export function headers({ loaderHeaders }: HeadersArgs) { return loaderHeaders; }
export const meta: MetaFunction = ({ error, location }) => buildRouteMeta({ pathname: location.pathname,
  title: isRouteErrorResponse(error) && error.status === 404 ? "Страница не найдена" : "Не удалось загрузить страницу",
  description: "Вернитесь на главную страницу или попробуйте обновить страницу позже.", indexable: false, kind: "page" });

export function Layout({ children }: { children: ReactNode }) {
  const rootData = useRouteLoaderData<typeof loader>("root");
  const nonce = rootData?.cspNonce ?? undefined;
  useEffect(() => { document.documentElement.dataset.hydrated = "true"; }, []);
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links nonce={nonce} />
        {rootData?.releaseSha && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: chunkRecoveryScript(rootData.releaseSha) }} />}
        <noscript><style dangerouslySetInnerHTML={{ __html: `[style*="opacity:0"], [style*="opacity: 0"] { opacity: 1 !important; transform: none !important; }` }} /></noscript>
      </head>
      <body>
        <MotionConfig reducedMotion="user"><ThemeProvider>{children}</ThemeProvider></MotionConfig>
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  const location = useLocation();
  if (isAdminPath(location.pathname)) return <Outlet />;
  return (
    <ConsentProvider>
      <ConsentShell className="min-h-screen bg-[var(--public-surface)] text-[var(--public-ink)]">
        <PublicHeader />
        <main id="main-content">
          <Outlet />
        </main>
        <PublicFooter />
      </ConsentShell>
      <ConsentBanner />
      <AnalyticsScripts />
    </ConsentProvider>
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
