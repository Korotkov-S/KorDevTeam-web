import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("blog/", "routes/blog-index.tsx"),
  route("blog/:slug/", "routes/blog-post.tsx"),
  route("cases/:slug/", "routes/case.tsx"),
  route("project/:slug/", "routes/legacy-project.tsx"),
  route("video/", "routes/static-page.tsx", { id: "video" }),
  route("journal/", "routes/static-page.tsx", { id: "journal" }),
  route("journal/issue-0/", "routes/static-page.tsx", { id: "journal-issue-0" }),
  route("under-metup/:slug/", "routes/static-page.tsx", { id: "under-metup" }),
] satisfies RouteConfig;
