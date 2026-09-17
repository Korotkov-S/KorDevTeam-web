import { Form, useActionData, useLoaderData, useMatches } from "react-router";

export { action, headers, loader } from "./settings.server";

type Setting = { id: string; key: string; value: Record<string, unknown>; version: number };

export default function AdminSettings() {
  const { settings } = useLoaderData<{ settings: Setting[] }>();
  const actionData = useActionData<{ error?: string; setting?: Setting }>();
  const csrfToken = useMatches().map(match => match.data).find(
    (value): value is { csrfToken: string } => Boolean(value && typeof value === "object" && "csrfToken" in value),
  )?.csrfToken ?? "";
  return <section className="mx-auto max-w-4xl space-y-6"><h1 className="text-3xl font-semibold">Настройки</h1>{actionData?.error ? <p role="alert" className="text-destructive">{actionData.error}</p> : null}<div className="space-y-5">{settings.map(setting => <Form method="post" key={setting.id} className="grid gap-3 rounded-xl border border-border bg-card p-5"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="key" value={setting.key} /><input type="hidden" name="expectedVersion" value={setting.version} /><h2 className="text-xl font-semibold">{setting.key}</h2><label className="grid gap-1"><span>Значение JSON</span><textarea name="value" rows={10} defaultValue={JSON.stringify(setting.value, null, 2)} className="rounded-lg border border-input bg-background p-3 font-mono" /></label><button className="justify-self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">Сохранить</button></Form>)}</div>{settings.length === 0 ? <Form method="post" className="grid gap-3 rounded-xl border border-border bg-card p-5"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="expectedVersion" value="0" /><label className="grid gap-1"><span>Ключ</span><input name="key" required className="rounded-lg border border-input bg-background px-3 py-2" /></label><label className="grid gap-1"><span>Значение JSON</span><textarea name="value" defaultValue="{}" rows={8} className="rounded-lg border border-input bg-background p-3 font-mono" /></label><button className="justify-self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">Создать</button></Form> : null}</section>;
}
