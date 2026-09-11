import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { VideoPage } from "../pages/VideoPage";
import { JournalIndexPage } from "../pages/JournalIndexPage";
import { JournalIssuePage } from "../pages/JournalIssuePage";
import { UnderMetupPage } from "../pages/UnderMetupPage";
import ru from "../locales/ru.json";
import type { RouteSeoInput } from "../server/seo/metadata";
import { documentHeaders } from "../server/http/cacheHeaders";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader({ request }: LoaderFunctionArgs) {
  const pathname = `${new URL(request.url).pathname.replace(/\/+$/, "")}/`;
  const pages: Record<string, { title: string; description: string; ogImage?: string }> = {
    "/video/": { title: "Видео", description: "Видео-презентация KorDevTeam: подход к разработке, примеры работ и атмосфера команды." },
    "/journal/": { title: ru.journal.archiveTitle, description: ru.journal.archiveDescription, ogImage: "/journal/issue-0-cover.webp" },
    "/journal/issue-0/": { title: ru.journal.seoIssueTitle, description: ru.journal.issueDescription, ogImage: "/journal/issue-0-cover.webp" },
  };
  for (const [key, video] of Object.entries(ru.underMetup.videos)) {
    pages[`/under-metup/${key.replace("video", "video-")}/`] = { title: video.title,
      description: `Запись Under Metup: ${video.title}, доклады, программа встречи и материалы для IT-сообщества.` };
  }
  const page = pages[pathname];
  if (!page) throw new Response(null, { status: 404, headers: documentHeaders });
  const seo: RouteSeoInput = { ...page, pathname, indexable: true, kind: "page" };
  return data({ seo, pathname }, { headers: documentHeaders });
}
export default function StaticPage() {
  const { pathname } = useLoaderData<typeof loader>();
  if (pathname === "/video/") return <VideoPage />;
  if (pathname === "/journal/") return <JournalIndexPage />;
  if (pathname.startsWith("/under-metup/")) return <UnderMetupPage />;
  return <JournalIssuePage />;
}
