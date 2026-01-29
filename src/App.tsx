import {
  BrowserRouter as Router,
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { BlogIndexPage } from "./pages/BlogIndexPage";
import { BlogPostPage } from "./pages/BlogPostPage";
import { ProjectPage } from "./pages/ProjectPage";
import { VideoPage } from "./pages/VideoPage";
import { UnderMetupPage } from "./pages/UnderMetupPage";
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
        path: "/blog",
        element: <BlogIndexPage />,
      },
      {
        path: "/blog/:slug",
        element: <BlogPostPage />,
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
