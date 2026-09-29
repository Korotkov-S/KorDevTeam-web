import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

export { action, headers, loader } from "./forgot-password.server";

type LoaderData = { loginCsrf: string };
type ActionData = { submitted?: boolean; message?: string; error?: string; loginCsrf?: string };

export function meta() { return [{ title: "Восстановление пароля | KorDevTeam" }]; }

export default function ForgotPassword() {
  const initial = useLoaderData<LoaderData>();
  const result = useActionData<ActionData>();
  const navigation = useNavigation();
  const loginCsrf = result?.loginCsrf ?? initial.loginCsrf;
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <p className="text-sm text-muted-foreground">KorDevTeam</p>
        <h1 className="mt-2 text-2xl font-semibold">Восстановление пароля</h1>
        <p className="mt-3 text-sm text-muted-foreground">Введите логин администратора. Ссылка для смены пароля придёт на team@korotkov.dev и будет действовать 30 минут.</p>
        {result?.message && <div role="status" className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">{result.message}</div>}
        {result?.error && <div role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">{result.error}</div>}
        {!result?.submitted && <Form method="post" action="/admin/forgot-password/" className="mt-6 space-y-4">
          <input type="hidden" name="_loginCsrf" value={loginCsrf} />
          <label className="block text-sm font-medium" htmlFor="reset-login">Логин</label>
          <input id="reset-login" name="login" autoComplete="username" required autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2" />
          <button type="submit" disabled={navigation.state !== "idle"}
            className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">
            {navigation.state === "submitting" ? "Отправляем…" : "Отправить ссылку"}
          </button>
        </Form>}
        <a href="/admin/login/" className="mt-5 block text-center text-sm text-primary underline underline-offset-4">Вернуться ко входу</a>
      </div>
    </main>
  );
}
