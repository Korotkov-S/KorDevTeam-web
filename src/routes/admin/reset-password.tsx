import { useEffect } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

export { action, headers, loader } from "./reset-password.server";

type LoaderData = { loginCsrf: string; tokenPresent: boolean; cleanTokenUrl: boolean };
type ActionData = { error?: string; loginCsrf?: string };

export function meta() { return [{ title: "Новый пароль | KorDevTeam" }]; }

export function resetPasswordUrlWithoutToken(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("token");
  return `${url.pathname}${url.search}${url.hash}`;
}

export default function ResetPassword() {
  const initial = useLoaderData<LoaderData>();
  const result = useActionData<ActionData>();
  const navigation = useNavigation();
  const loginCsrf = result?.loginCsrf ?? initial.loginCsrf;
  useEffect(() => {
    if (!initial.cleanTokenUrl) return;
    window.history.replaceState(
      window.history.state,
      "",
      resetPasswordUrlWithoutToken(window.location.href),
    );
  }, [initial.cleanTokenUrl]);
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <p className="text-sm text-muted-foreground">KorDevTeam</p>
        <h1 className="mt-2 text-2xl font-semibold">Установить новый пароль</h1>
        <p className="mt-3 text-sm text-muted-foreground">Пароль должен содержать от 14 до 256 символов. После смены пароля все предыдущие входы будут завершены.</p>
        {result?.error && <div role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">{result.error}</div>}
        {initial.tokenPresent ? <Form method="post" action="/admin/reset-password/" className="mt-6 space-y-4">
          <input type="hidden" name="_loginCsrf" value={loginCsrf} />
          <label className="block text-sm font-medium" htmlFor="new-password">Новый пароль</label>
          <input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={14} maxLength={256} required autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2" />
          <label className="block text-sm font-medium" htmlFor="confirm-password">Повторите пароль</label>
          <input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={14} maxLength={256} required
            className="w-full rounded-lg border border-input bg-background px-3 py-2" />
          <button type="submit" disabled={navigation.state !== "idle"}
            className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">
            {navigation.state === "submitting" ? "Сохраняем…" : "Сохранить новый пароль"}
          </button>
        </Form> : <div role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">В ссылке отсутствует токен восстановления.</div>}
        <a href="/admin/forgot-password/" className="mt-5 block text-center text-sm text-primary underline underline-offset-4">Запросить новую ссылку</a>
      </div>
    </main>
  );
}
