import { Outlet, ScrollRestoration } from "react-router-dom";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Toaster } from "../components/ui/sonner";

export function Root() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}
