import { useState } from "react";
import { flushSync } from "react-dom";
import { Form, Link, useActionData, useLoaderData, useMatches } from "react-router";

import { AdminFieldError } from "../../components/admin/AdminFieldError";
import { MediaPicker } from "../../components/admin/MediaPicker";
import { UnsavedChangesGuard } from "../../components/admin/UnsavedChangesGuard";

export { action, headers, loader } from "./content-editor.server";

type Entry = Record<string, unknown> & { id: string; slug: string; title: string; status: "draft" | "published"; version: number };
type Data = { kind: string; entry: Entry | null; relations: unknown[]; mediaRefs: unknown[]; revisions: Array<{ version: number; createdAt: string }> };
type ActionData = { error?: string; fields?: Record<string, string>; currentVersion?: number };

const inputClass = "rounded-lg border border-input bg-background px-3 py-2";

export default function AdminContentEditor() {
  const data = useLoaderData<Data>();
  const actionData = useActionData<ActionData>();
  const [dirty, setDirty] = useState(false);
  const csrfToken = useMatches().map(match => match.data).find(
    (value): value is { csrfToken: string } => Boolean(value && typeof value === "object" && "csrfToken" in value),
  )?.csrfToken ?? "";
  const entry = data.entry;
  const field = (name: string, fallback = "") => actionData?.fields?.[name] ?? String(entry?.[name] ?? fallback);
  const payload = actionData?.fields?.payload ?? JSON.stringify(entry?.payload ?? {}, null, 2);
  const relations = actionData?.fields?.relations ?? JSON.stringify(data.relations, null, 2);
  const mediaRefs = actionData?.fields?.mediaRefs ?? JSON.stringify(data.mediaRefs, null, 2);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <UnsavedChangesGuard when={dirty} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link className="text-sm underline" to={`/admin/content/${data.kind}/`}>← К списку</Link><h1 className="mt-2 text-3xl font-semibold">{entry ? entry.title || "Материал" : "Новый материал"}</h1></div>
        {entry ? <span className="rounded-full bg-muted px-3 py-1 text-sm">{entry.status === "published" ? "Опубликовано" : "Черновик"} · v{entry.version}</span> : null}
      </div>
      {actionData?.error ? <div role="alert" tabIndex={-1} className="rounded-xl border border-destructive p-4 text-destructive"><p>{actionData.error}</p>{actionData.currentVersion ? <p className="mt-1 text-sm">Текущая версия на сервере: {actionData.currentVersion}</p> : null}</div> : null}

      <nav aria-label="Разделы редактора" className="flex flex-wrap gap-2 text-sm">
        {["Контент", "SEO", "Связи", "Предпросмотр", "История"].map(label => <a key={label} href={`#${label.toLowerCase()}`} className="rounded-full border border-input px-3 py-1">{label}</a>)}
      </nav>

      <Form method="post" onChange={() => setDirty(true)} onSubmit={() => flushSync(() => setDirty(false))} className="space-y-8">
        <input type="hidden" name="_csrf" value={csrfToken} />
        {entry ? <input type="hidden" name="expectedVersion" value={entry.version} /> : null}
        <section id="контент" className="grid gap-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Контент</h2>
          <label className="grid gap-1"><span>URL-имя</span><input name="slug" required defaultValue={field("slug")} className={inputClass} /></label>
          <label className="grid gap-1"><span>Заголовок</span><input name="title" defaultValue={field("title")} className={inputClass} /></label>
          <label className="grid gap-1"><span>Краткое описание</span><textarea name="excerpt" defaultValue={field("excerpt")} rows={3} className={inputClass} /></label>
          <label className="grid gap-1"><span>Текст Markdown</span><textarea name="bodyMd" defaultValue={field("bodyMd")} rows={18} className={`${inputClass} font-mono`} /></label>
          <label className="grid gap-1"><span>Структурированные данные JSON</span><textarea name="payload" defaultValue={payload} rows={12} className={`${inputClass} font-mono`} /></label>
        </section>
        <section id="seo" className="grid gap-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">SEO</h2>
          <label className="grid gap-1"><span>SEO-заголовок</span><input name="seoTitle" maxLength={180} defaultValue={field("seoTitle")} className={inputClass} /></label>
          <label className="grid gap-1"><span>SEO-описание</span><textarea name="seoDescription" maxLength={320} defaultValue={field("seoDescription")} rows={3} className={inputClass} /></label>
          <MediaPicker name="ogMediaId" value={field("ogMediaId")} />
          <label className="flex items-center gap-2"><input type="checkbox" name="indexable" value="true" defaultChecked={entry?.indexable !== false} /><span>Разрешить индексацию</span></label>
        </section>
        <section id="связи" className="grid gap-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Связи</h2>
          <label className="grid gap-1"><span>Связанные материалы JSON</span><textarea name="relations" defaultValue={relations} rows={7} className={`${inputClass} font-mono`} /></label>
          <label className="grid gap-1"><span>Ссылки на изображения JSON</span><textarea name="mediaRefs" defaultValue={mediaRefs} rows={7} className={`${inputClass} font-mono`} /></label>
        </section>
        <AdminFieldError message={actionData?.error} />
        <div className="sticky bottom-3 flex flex-wrap gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
          <button name="intent" value="save-draft" className="rounded-lg border border-input px-4 py-2 font-medium">Сохранить черновик</button>
          <button name="intent" value="publish" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Опубликовать</button>
          <button name="intent" value="preview" formAction={`/admin/content/${data.kind}/preview/`} className="rounded-lg border border-input px-4 py-2">Предпросмотр</button>
        </div>
      </Form>

      {entry ? <section id="история" className="space-y-4 rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">История</h2>{data.revisions.length ? <ul className="space-y-2">{data.revisions.map(revision => <li key={revision.version} className="flex items-center justify-between gap-3"><span>Версия {revision.version}</span><Form method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="expectedVersion" value={entry.version} /><input type="hidden" name="revisionVersion" value={revision.version} /><button name="intent" value="restore" className="text-sm underline">Восстановить</button></Form></li>)}</ul> : <p className="text-muted-foreground">Предыдущих версий пока нет.</p>}</section> : null}

      {entry ? <section className="space-y-4 rounded-xl border border-destructive/40 p-5"><h2 className="text-xl font-semibold text-destructive">Опасная зона</h2>{entry.status === "published" ? <Form method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="expectedVersion" value={entry.version} /><button name="intent" value="unpublish" className="underline">Снять с публикации</button></Form> : null}<Form method="post" className="grid max-w-md gap-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="expectedVersion" value={entry.version} /><label>Для удаления введите <strong>{entry.slug}</strong><input name="confirmSlug" className={`${inputClass} mt-1 w-full`} /></label><button name="intent" value="delete" className="justify-self-start rounded-lg bg-destructive px-4 py-2 text-destructive-foreground">Удалить без восстановления</button></Form></section> : null}
    </section>
  );
}
