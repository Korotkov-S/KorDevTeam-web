import { Form, useActionData, useLoaderData, useMatches } from "react-router";

export { action, headers, loader } from "./media.server";

type MediaAsset = {
  id: string;
  publicUrl: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  altText: string;
  decorative: boolean;
  usageCount: number;
  version: number;
};

type MediaLoaderData = { assets: MediaAsset[] };
type MediaActionData = { error?: string };

function formatBytes(value: number): string {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

export default function AdminMediaRoute() {
  const { assets } = useLoaderData<MediaLoaderData>();
  const actionData = useActionData<MediaActionData>();
  const csrfToken = useMatches().map(match => match.data).find(
    (data): data is { csrfToken: string } => Boolean(data && typeof data === "object" && "csrfToken" in data),
  )?.csrfToken ?? "";

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Медиатека</h1>
        <p className="mt-2 text-muted-foreground">Изображения хранятся в публичном объектном хранилище.</p>
      </div>

      {actionData?.error ? <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{actionData.error}</p> : null}

      <Form method="post" encType="multipart/form-data" className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <input type="hidden" name="intent" value="upload" />
        <input type="hidden" name="_csrf" value={csrfToken} />
        <label className="grid gap-2">
          <span className="font-medium">Изображение</span>
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required />
          <span className="text-sm text-muted-foreground">JPG, PNG или WebP, до 20 МБ.</span>
        </label>
        <label className="grid gap-2">
          <span className="font-medium">Альтернативный текст</span>
          <input name="altText" type="text" maxLength={500} className="rounded-lg border border-input bg-background px-3 py-2" />
          <span className="text-sm text-muted-foreground">Опишите содержание изображения для доступности.</span>
        </label>
        <label className="flex items-center gap-2">
          <input name="decorative" type="checkbox" />
          <span>Декоративное изображение</span>
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground sm:justify-self-start">Загрузить</button>
      </Form>

      {assets.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">Изображений пока нет.</p> : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {assets.map(asset => (
            <li key={asset.id} className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[160px_1fr]">
              <img src={asset.publicUrl} alt={asset.decorative ? "" : asset.altText} className="aspect-video w-full rounded-lg bg-muted object-contain" />
              <div className="min-w-0 space-y-3">
                <p className="text-sm text-muted-foreground">{asset.width}×{asset.height} · {formatBytes(asset.byteSize)} · используется: {asset.usageCount}</p>
                <Form method="post" className="space-y-3">
                  <input type="hidden" name="intent" value="update-metadata" />
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <input type="hidden" name="id" value={asset.id} />
                  <input type="hidden" name="expectedVersion" value={asset.version} />
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Альтернативный текст</span>
                    <input name="altText" defaultValue={asset.altText} maxLength={500} className="rounded-lg border border-input bg-background px-3 py-2" />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input name="decorative" type="checkbox" defaultChecked={asset.decorative} />
                    <span>Декоративное</span>
                  </label>
                  <button type="submit" className="rounded-lg border border-input px-3 py-2 text-sm font-medium">Сохранить</button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <input type="hidden" name="id" value={asset.id} />
                  <input type="hidden" name="expectedVersion" value={asset.version} />
                  <button type="submit" disabled={asset.usageCount > 0} className="text-sm text-destructive underline disabled:cursor-not-allowed disabled:opacity-50">Удалить</button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
