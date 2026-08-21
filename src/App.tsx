import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import React, { Suspense, lazy } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";

const Root = lazy(() => import("./pages/Root").then((m) => ({ default: m.Root })));
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const BlogIndexPage = lazy(() => import("./pages/BlogIndexPage").then((m) => ({ default: m.BlogIndexPage })));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage").then((m) => ({ default: m.BlogPostPage })));
const ProjectPage = lazy(() => import("./pages/ProjectPage").then((m) => ({ default: m.ProjectPage })));
const VideoPage = lazy(() => import("./pages/VideoPage").then((m) => ({ default: m.VideoPage })));
const UnderMetupPage = lazy(() => import("./pages/UnderMetupPage").then((m) => ({ default: m.UnderMetupPage })));
const JournalIndexPage = lazy(() =>
  import("./pages/JournalIndexPage").then((m) => ({ default: m.JournalIndexPage })),
);
const JournalIssuePage = lazy(() =>
  import("./pages/JournalIssuePage").then((m) => ({ default: m.JournalIssuePage })),
);
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));

function PageLoader() {
  return (
    <div
      className="min-h-screen bg-background"
      role="status"
      aria-label="Загрузка страницы"
    />
  );
}

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
        path: "/journal",
        element: <JournalIndexPage />,
      },
      {
        path: "/journal/issue-0",
        element: <JournalIssuePage />,
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
      <Suspense fallback={<PageLoader />}>
        <RouterProvider router={router} />
      </Suspense>
    </ThemeProvider>
  );
}
