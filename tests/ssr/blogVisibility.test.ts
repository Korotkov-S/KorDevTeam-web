import assert from "node:assert/strict";
import test from "node:test";

import { createDb } from "../../src/server/db/client";
import { contentEntries } from "../../src/server/db/schema";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { startTestRuntime } from "./support/runtime";

test("blog catalog lists every published article even when search indexing is disabled", async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);

  const db = createDb(databaseUrl);
  const publishedAt = new Date("2026-09-29T08:00:00.000Z");
  await db.insert(contentEntries).values([
    {
      kind: "article",
      slug: "published-indexable",
      status: "published",
      title: "Опубликованная индексируемая статья",
      excerpt: "Видна в блоге и поисковых системах.",
      bodyMd: "Текст индексируемой статьи.",
      seoTitle: "Опубликованная индексируемая статья",
      seoDescription: "Описание индексируемой статьи для поисковых систем.",
      indexable: true,
      payload: {},
      publishedAt,
    },
    {
      kind: "article",
      slug: "published-noindex",
      status: "published",
      title: "Опубликованная статья без индексации",
      excerpt: "Видна читателям блога, но закрыта от индексации.",
      bodyMd: "Текст статьи без индексации.",
      seoTitle: "Опубликованная статья без индексации",
      seoDescription: "Описание статьи, временно закрытой от поисковых систем.",
      indexable: false,
      payload: {},
      publishedAt,
    },
    {
      kind: "article",
      slug: "draft-hidden",
      status: "draft",
      title: "Неопубликованный черновик",
      excerpt: "Не должен отображаться в блоге.",
      bodyMd: "Текст черновика.",
      seoTitle: "Неопубликованный черновик",
      seoDescription: "Описание неопубликованного черновика.",
      indexable: true,
      payload: {},
    },
  ]);

  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);

  const response = await fetch(`${runtime.origin}/blog/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /href="\/blog\/published-indexable\/"/u);
  assert.match(html, /href="\/blog\/published-noindex\/"/u);
  assert.doesNotMatch(html, /href="\/blog\/draft-hidden\/"/u);
});
