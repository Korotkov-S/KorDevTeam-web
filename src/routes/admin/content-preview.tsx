import { Link, useActionData } from "react-router";

export { action, headers } from "./content-preview.server";

export default function AdminContentPreview() {
  const data = useActionData<{ preview?: { entry?: Record<string, unknown> }; error?: string }>();
  return <section className="mx-auto max-w-4xl space-y-5"><Link to="../" className="underline">← Вернуться в редактор</Link><h1 className="text-3xl font-semibold">Предпросмотр</h1>{data?.error ? <p role="alert" className="text-destructive">{data.error}</p> : <pre className="overflow-auto rounded-xl border border-border bg-card p-5 whitespace-pre-wrap">{JSON.stringify(data?.preview ?? {}, null, 2)}</pre>}</section>;
}
