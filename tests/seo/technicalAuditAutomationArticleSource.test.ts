import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "ai-ops-business-automation-audit";
const title = "Технический аудит сайта и автоматизации: что проверить после изменений с ИИ";

test("technical audit guide covers the complete operating contour and actionable deliverables", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "Технический аудит сайта и автоматизации");
  assert.equal(record.seoDescription, "Что входит в технический аудит сайта, интеграций и AI-автоматизации: критические сценарии, доступы, резервные копии, мониторинг, SEO и план исправлений.");
  assert.equal(record.date, "17 августа 2026");
  assert.equal(record.updatedDate, "25 сентября 2026");
  assert.equal(record.readTime, "10 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /AIOps.+устоявш|устоявш.+AIOps/is);
  assert.match(body, /карт[ауы].+зависимост/i);
  assert.match(body, /сквозн.+проверк.+заяв/i);
  assert.match(body, /секрет|токен/i);
  assert.match(body, /тестов.+восстановлен/i);
  assert.match(body, /техническ.+SEO/i);
  assert.match(body, /критери.+приоритет/i);
  assert.match(body, /реестр.+риск/i);
  assert.match(body, /план.+исправлен/i);
  assert.match(body, /регламент.+изменен/i);
  assert.match(body, /\]\(\/blog\/ai-business-strategy-without-hype\/\)/);
  assert.match(body, /\]\(\/blog\/business-processes-before-automation\/\)/);
  assert.match(body, /\]\(\/services\/additional-service\/\)/);
  assert.match(body, /\]\(\/services\/integrations\/\)/);
  assert.match(body, /\]\(\/services\/ai-automation\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 15_000, `article is too short: ${body.length} characters`);
});
