import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { HomePage } from "./pages/HomePage";
import { BlogPostPage } from "./pages/BlogPostPage";
import { ProjectPage } from "./pages/ProjectPage";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <Router>
      <div className="dark min-h-screen bg-background text-foreground">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/project/:projectId" element={<ProjectPage />} />
          </Routes>
        </main>
        <Footer />
        <Toaster />
      </div>
    </Router>
  );
}
