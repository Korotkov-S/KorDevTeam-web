import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";
import { Footer } from "./components/Footer";
import { FloatingButtons } from "./components/FloatingButtons";
import { Header } from "./components/Header";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./styles/index.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
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
      : error.statusText
    : "Не удалось загрузить страницу";

  return (
    <main className="min-h-screen bg-background px-6 py-32 text-foreground">
      <h1 className="text-3xl font-bold">{message}</h1>
    </main>
  );
}
