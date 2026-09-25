import { Form, useActionData, useLoaderData, useMatches } from "react-router";

import { MCP_SCOPES, type McpScope } from "../../server/mcp/contracts";

export { action, headers, loader } from "./mcp.server";

type TokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: McpScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};
type LoaderData = { tokens: TokenSummary[]; endpoint: string };
type ActionData = { error?: string; token?: string; summary?: TokenSummary; revoked?: boolean };

const scopeLabels: Record<McpScope, string> = {
  "content:read": "Читать материалы",
  "content:write": "Создавать и редактировать черновики",
  "content:publish": "Публиковать и снимать с публикации",
  "media:read": "Читать медиатеку",
  "media:write": "Загружать изображения",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export default function AdminMcpRoute() {
  const { tokens, endpoint } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const csrfToken = useMatches().map(match => match.data).find(
    (data): data is { csrfToken: string } => Boolean(data && typeof data === "object" && "csrfToken" in data),
  )?.csrfToken ?? "";
  const codexConfig = `[mcp_servers.kordev_site]\nurl = "${endpoint}"\nbearer_token_env_var = "KORDEV_MCP_TOKEN"`;

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">MCP-доступ</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Выпускайте отдельные токены для Codex и других MCP-клиентов. Секрет показывается только один раз.
        </p>
      </div>

      {actionData?.error ? (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{actionData.error}</p>
      ) : null}

      {actionData?.token ? (
        <section aria-live="polite" className="rounded-xl border border-primary bg-card p-5">
          <h2 className="text-xl font-semibold">Сохраните токен сейчас</h2>
          <p className="mt-2 text-sm text-muted-foreground">После обновления страницы он больше не показывается.</p>
          <code className="mt-4 block break-all rounded-lg bg-muted p-3">{actionData.token}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(actionData.token!)}
            className="mt-3 rounded-lg border border-input px-3 py-2 text-sm font-medium"
          >Копировать</button>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Form method="post" className="space-y-5 rounded-xl border border-border bg-card p-5">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="_csrf" value={csrfToken} />
          <div>
            <h2 className="text-xl font-semibold">Новый токен</h2>
            <p className="mt-1 text-sm text-muted-foreground">Дайте токену понятное имя устройства или интеграции.</p>
          </div>
          <label className="grid gap-2">
            <span className="font-medium">Название</span>
            <input name="name" required maxLength={120} placeholder="Codex MacBook" className="rounded-lg border border-input bg-background px-3 py-2" />
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">Права доступа</legend>
            {MCP_SCOPES.map(scope => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input name="scope" type="checkbox" value={scope} defaultChecked className="mt-1" />
                <span><span className="font-medium">{scope}</span><br /><span className="text-muted-foreground">{scopeLabels[scope]}</span></span>
              </label>
            ))}
          </fieldset>
          <label className="grid gap-2">
            <span className="font-medium">Срок действия</span>
            <select name="ttlDays" defaultValue="365" className="rounded-lg border border-input bg-background px-3 py-2">
              <option value="30">30 дней</option>
              <option value="90">90 дней</option>
              <option value="365">365 дней</option>
              <option value="never">Без срока</option>
            </select>
          </label>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Создать токен</button>
        </Form>

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="text-xl font-semibold">Подключение Codex</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Endpoint: <code className="break-all">{endpoint}</code>. Для локальной разработки адрес будет содержать localhost.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm"><code>{codexConfig}</code></pre>
          <p className="text-sm text-muted-foreground">
            Сохраните выданный секрет в переменной <code>KORDEV_MCP_TOKEN</code>. В конфигурацию сам токен не вставляйте.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Выпущенные токены</h2>
        {tokens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">Токенов пока нет.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr><th className="p-3">Название</th><th className="p-3">Префикс и права</th><th className="p-3">Даты</th><th className="p-3">Действие</th></tr>
              </thead>
              <tbody>
                {tokens.map(token => (
                  <tr key={token.id} className="border-b border-border last:border-0">
                    <td className="p-3 align-top font-medium">{token.name}</td>
                    <td className="p-3 align-top"><code>{token.tokenPrefix}…</code><div className="mt-2 text-muted-foreground">{token.scopes.join(", ")}</div></td>
                    <td className="p-3 align-top text-muted-foreground">
                      <div>Создан: {formatDate(token.createdAt)}</div>
                      <div>Использован: {formatDate(token.lastUsedAt)}</div>
                      <div>Истекает: {formatDate(token.expiresAt)}</div>
                      <div>Отозван: {formatDate(token.revokedAt)}</div>
                    </td>
                    <td className="p-3 align-top">
                      {token.revokedAt ? <span className="text-muted-foreground">Отозван</span> : (
                        <Form method="post">
                          <input type="hidden" name="intent" value="revoke" />
                          <input type="hidden" name="_csrf" value={csrfToken} />
                          <input type="hidden" name="id" value={token.id} />
                          <button type="submit" className="text-destructive underline">Отозвать</button>
                        </Form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
