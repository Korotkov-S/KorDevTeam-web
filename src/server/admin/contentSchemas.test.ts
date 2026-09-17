import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { parseAdminContentCommand } from "./contentSchemas";

const base = () => ({
  kind: "article" as const,
  slug: "new-article",
  title: "Новая статья",
  bodyMd: "Текст",
  seoTitle: "SEO заголовок",
  seoDescription: "SEO описание",
  payload: {},
  intent: "draft" as const,
  relations: [],
  mediaRefs: [],
});

test("admin command strictly validates relations and media references", () => {
  const targetId = randomUUID();
  const mediaId = randomUUID();
  const parsed = parseAdminContentCommand({
    ...base(),
    relations: [{ targetId, type: "related_article", sortOrder: 0 }],
    mediaRefs: [{ mediaId, fieldPath: "bodyMd:0" }],
  });
  assert.equal(parsed.relations[0].targetId, targetId);
  assert.equal(parsed.mediaRefs[0].mediaId, mediaId);

  for (const command of [
    { ...base(), relations: [{ targetId, type: "wrong", sortOrder: 0 }] },
    { ...base(), relations: [{ targetId, type: "related_article", sortOrder: -1 }] },
    { ...base(), mediaRefs: [{ mediaId, fieldPath: "" }] },
    { ...base(), mediaRefs: [{ mediaId, fieldPath: "x".repeat(301) }] },
    { ...base(), extra: true },
  ]) assert.throws(() => parseAdminContentCommand(command as never), /content_validation_error/);
});
