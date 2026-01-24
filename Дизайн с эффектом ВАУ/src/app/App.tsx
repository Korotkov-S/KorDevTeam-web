import { Header } from "@/app/components/Header";
import { Hero } from "@/app/components/Hero";
import { Services } from "@/app/components/Services";
import { Technologies } from "@/app/components/Technologies";
import { Projects } from "@/app/components/Projects";
import { Blog } from "@/app/components/Blog";
import { Method } from "@/app/components/Method";
import { Feedback } from "@/app/components/Feedback";
import { Footer } from "@/app/components/Footer";

export default function App() {
  return (
    <div className="min-h-screen bg-[#0B0F1A] relative overflow-hidden">
      {/* Subtle animated orbs */}
      <div className="fixed top-0 -left-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-blob" />
      <div className="fixed top-0 -right-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
      <div className="fixed -bottom-48 left-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-blob animation-delay-4000" />
      
      <div className="relative z-10">
        <Header />
        <Hero />
        <Services />
        <Technologies />
        <Projects />
        <Blog />
        <Method />
        <Feedback />
        <Footer />
      </div>
    </div>
  );
}