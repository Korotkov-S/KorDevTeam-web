import { Link, useActionData, type MetaFunction } from "react-router";

import { MarkdownContent } from "../../components/MarkdownContent";

export { action, headers } from "./content-preview.server";

export const meta: MetaFunction = () => [
  { title: "Предпросмотр материала | KorDevTeam" },
  { name: "robots", content: "noindex, nofollow" },
];

type PreviewEntry = {
  id?: string;
  kind?: string;
  title?: string;
  excerpt?: string;
  bodyMd?: string;
  status?: string;
};

type ContentPreview = {
  entry?: PreviewEntry;
  relations?: unknown[];
  mediaRefs?: unknown[];
};

const kindLabels: Record<string, string> = {
  article: "статьи",
  case: "кейса",
  service: "услуги",
  page: "страницы",
  faq: "FAQ",
};

function withoutRepeatedTitle(markdown: string, title: string) {
  const match = markdown.match(/^\s*#\s+(.+)\s*$/m);
  if (!match) return markdown;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru");
  return normalize(match[1]) === normalize(title)
    ? markdown.replace(match[0], "").trim()
    : markdown;
}

export function ContentPreviewDocument({ preview }: { preview: ContentPreview }) {
  const entry = preview.entry;
  if (!entry) return <p role="alert" className="text-destructive">Не удалось подготовить предпросмотр.</p>;

  const kind = entry.kind || "article";
  const title = entry.title || "Без названия";
  const body = withoutRepeatedTitle(entry.bodyMd || "", title);
  const backTo = entry.id
    ? `/admin/content/${kind}/${entry.id}/`
    : `/admin/content/${kind}/`;

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={backTo} className="underline underline-offset-4">← Вернуться в редактор</Link>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-sm text-muted-foreground">
          Предпросмотр {kindLabels[kind] || "материала"} · изменения не сохранены
        </span>
      </div>

      <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="border-b border-border bg-muted/30 px-6 py-8 sm:px-10 sm:py-12">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">Предпросмотр</p>
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-5xl">
            {title}
          </h1>
          {entry.excerpt ? <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">{entry.excerpt}</p> : null}
        </header>
        <div className="px-6 py-8 sm:px-10 sm:py-12">
          {body
            ? <MarkdownContent markdown={body} />
            : <p className="text-muted-foreground">Основной текст пока не заполнен.</p>}
        </div>
      </article>
    </section>
  );
}

export default function AdminContentPreview() {
  const data = useActionData<{ preview?: ContentPreview; error?: string }>();
  if (data?.error) return <p role="alert" className="text-destructive">{data.error}</p>;
  return <ContentPreviewDocument preview={data?.preview ?? {}} />;
}
