import { Form, Link, useLoaderData } from "react-router";

export { headers, loader } from "./content-list.server";

type Entry = { id: string; slug: string; title: string; status: "draft" | "published"; version: number; updatedAt: string };
type Data = { kind: string; entries: Entry[]; filters: { q: string; status: string } };

const labels: Record<string, string> = { service: "Услуги", case: "Кейсы", article: "Статьи", page: "Страницы", faq: "FAQ" };

export default function AdminContentList() {
  const data = useLoaderData<Data>();
  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{labels[data.kind] ?? data.kind}</h1>
        <Link to={`/admin/content/${data.kind}/new/`} className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Создать</Link>
      </div>
      <Form method="get" className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <label className="grid gap-1"><span className="text-sm">Поиск</span><input name="q" defaultValue={data.filters.q} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
        <label className="grid gap-1"><span className="text-sm">Статус</span><select name="status" defaultValue={data.filters.status} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все</option><option value="draft">Черновик</option><option value="published">Опубликовано</option></select></label>
        <button className="self-end rounded-lg border border-input px-4 py-2" type="submit">Применить</button>
      </Form>
      {data.entries.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">Материалов не найдено.</p> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left"><thead className="bg-muted"><tr><th className="p-3">Название</th><th className="p-3">URL</th><th className="p-3">Статус</th><th className="p-3">Версия</th></tr></thead>
            <tbody>{data.entries.map(entry => <tr key={entry.id} className="border-t border-border"><td className="p-3"><Link className="font-medium underline" to={`/admin/content/${data.kind}/${entry.id}/`}>{entry.title || "Без названия"}</Link></td><td className="p-3 font-mono text-sm">{entry.slug}</td><td className="p-3">{entry.status === "published" ? "Опубликовано" : "Черновик"}</td><td className="p-3">{entry.version}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
