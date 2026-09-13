import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sitemap.xml", "routes/sitemap.xml.ts"),
  route("sitemap-index.xml", "routes/sitemap-index.xml.ts"),
  route("sitemap-pages.xml", "routes/sitemap-pages.xml.ts"),
  route("sitemap-blog.xml", "routes/sitemap-blog.xml.ts"),
  route("robots.txt", "routes/robots.txt.ts"),
  route("services/", "routes/catalog.tsx", { id: "services" }),
  route("cases/", "routes/catalog.tsx", { id: "cases" }),
  route("services/:slug/", "routes/content-page.tsx", { id: "service-detail" }),
  route("requisites/", "routes/legal.tsx", { id: "requisites" }),
  route("privacy/", "routes/legal.tsx", { id: "privacy" }),
  route(":slug/", "routes/content-page.tsx", { id: "content-page" }),
  route("blog/", "routes/blog-index.tsx"),
  route("blog/:slug/", "routes/blog-post.tsx"),
  route("cases/:slug/", "routes/case.tsx"),
  route("project/:slug/", "routes/legacy-project.tsx"),
  route("video/", "routes/static-page.tsx", { id: "video" }),
  route("journal/", "routes/static-page.tsx", { id: "journal" }),
  route("journal/issue-0/", "routes/static-page.tsx", { id: "journal-issue-0" }),
  route("under-metup/:slug/", "routes/static-page.tsx", { id: "under-metup" }),
] satisfies RouteConfig;
