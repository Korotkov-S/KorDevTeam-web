import { Outlet, ScrollRestoration } from "react-router-dom";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Toaster } from "../components/ui/sonner";
import { NewYearAnimation } from "../components/NewYearAnimation";
import { FloatingButtons } from "../components/FloatingButtons";

export function Root() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden" style={{ maxWidth: '100vw' }}>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <FloatingButtons />
      <Toaster />
      <ScrollRestoration />
      <NewYearAnimation />
    </div>
  );
}
