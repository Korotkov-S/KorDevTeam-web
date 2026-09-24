import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyArticleSources, loadArticleSources } from "../src/server/content/articleSources";
import { getDb } from "../src/server/db/client";

const articleSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseArticleSyncArgs(args: readonly string[]): string[] {
  const slugs: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] !== "--slug") throw new Error("article_sync_invalid_arguments");
    const slug = args[index + 1];
    if (!slug || !articleSlug.test(slug)) throw new Error("article_sync_invalid_arguments");
    slugs.push(slug);
  }
  if (!slugs.length || new Set(slugs).size !== slugs.length) {
    throw new Error("article_sync_invalid_arguments");
  }
  return slugs;
}

export async function syncArticles(slugs: readonly string[]) {
  const sources = await loadArticleSources(slugs);
  return applyArticleSources(getDb(), sources);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let slugs: string[];
  try {
    slugs = parseArticleSyncArgs(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof Error && error.message === "article_sync_invalid_arguments"
      ? error.message
      : "article_sync_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
    process.exitCode = 1;
    slugs = [];
  }
  if (slugs.length) {
    syncArticles(slugs)
      .then(result => process.stdout.write(`${JSON.stringify({ ok: true, articles: result })}\n`))
      .catch(error => {
        const code = error instanceof Error && /^(article_source_|article_sync_)/.test(error.message)
          ? error.message
          : "article_sync_failed";
        process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
        process.exitCode = 1;
      });
  }
}
