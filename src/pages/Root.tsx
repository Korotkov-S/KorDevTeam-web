import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Toaster } from "../components/ui/sonner";
import { FloatingButtons } from "../components/FloatingButtons";

export function Root() {
  const { pathname } = useLocation();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <HelmetProvider>
      <div
        className="min-h-screen bg-background text-foreground overflow-hidden"
        style={{ maxWidth: "100vw" }}
      >
        {/* WOW-style ambient background */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
          <div className="absolute top-0 -left-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-blob" />
          <div className="absolute top-0 -right-48 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-48 left-1/2 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl animate-blob animation-delay-4000" />
        </div>

        <div className="relative z-10">
          {!isAdmin && <Header />}
          <main>
            <Outlet />
          </main>
          {!isAdmin && <Footer />}
          {!isAdmin && <FloatingButtons />}
          <Toaster />
          <ScrollRestoration />
        </div>
      </div>
    </HelmetProvider>
  );
}
