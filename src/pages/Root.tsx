import { Outlet, ScrollRestoration } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Toaster } from "../components/ui/sonner";
import { FloatingButtons } from "../components/FloatingButtons";

export function Root() {
  return (
    <HelmetProvider>
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden" style={{ maxWidth: '100vw' }}>
        <Header />
        <main>
          <Outlet />
        </main>
        <Footer />
        <FloatingButtons />
        <Toaster />
        <ScrollRestoration />
      </div>
    </HelmetProvider>
  );
}
