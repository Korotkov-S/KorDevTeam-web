import {
  BrowserRouter as Router,
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { BlogPostPage } from "./pages/BlogPostPage";
import { ProjectPage } from "./pages/ProjectPage";
import { VideoPage } from "./pages/VideoPage";
import { UnderMetupPage } from "./pages/UnderMetupPage";
import { KrasotulyaCrmPostPage } from "./pages/KrasotulyaCrmPostPage";
import { Root } from "./pages/Root";
import { AdminPage } from "./pages/AdminPage";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./i18n";

const router = createBrowserRouter([
  {
    element: <Root />,
    path: "/",
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "/blog/:slug",
        element: <BlogPostPage />,
      },
      {
        path: "/krasotulya-crm/:slug",
        element: <KrasotulyaCrmPostPage />,
      },
      {
        path: "/project/:projectId",
        element: <ProjectPage />,
      },
      {
        path: "/video",
        element: <VideoPage />,
      },
      {
        path: "/under-metup/:slug",
        element: <UnderMetupPage />,
      },
      {
        path: "/admin",
        element: <AdminPage />,
      },
    ],
  },
]);

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
