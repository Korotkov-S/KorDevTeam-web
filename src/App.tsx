import {
  BrowserRouter as Router,
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { BlogPostPage } from "./pages/BlogPostPage";
import { ProjectPage } from "./pages/ProjectPage";
import { Root } from "./pages/Root";
import { ThemeProvider } from "./contexts/ThemeContext";

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
        path: "/project/:projectId",
        element: <ProjectPage />,
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
