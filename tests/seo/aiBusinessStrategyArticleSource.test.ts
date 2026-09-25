import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "ai-business-strategy-without-hype";
const title = "ИИ для бизнеса: как выбрать задачу и внедрить без хайпа";

test("AI business guide explains use cases, a controlled pilot and human review", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "ИИ для бизнеса: как внедрить без хайпа");
  assert.equal(record.seoDescription, "Как внедрить ИИ в бизнес: выбрать процесс, оценить данные и риски, запустить пилот с проверкой человеком, измерить эффект и встроить решение в работу.");
  assert.equal(record.date, "19 июня 2026");
  assert.equal(record.updatedDate, "25 сентября 2026");
  assert.equal(record.readTime, "10 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /человек.+провер/i);
  assert.match(body, /базов.+метрик|метрик.+до внедрения/i);
  assert.match(body, /стоимост.+ошиб/i);
  assert.match(body, /контрольн.+набор/i);
  assert.match(body, /персональн.+данн/i);
  assert.match(body, /стоимост.+операц/i);
  assert.match(body, /критери.+останов/i);
  assert.match(body, /готов.+промпт/i);
  assert.match(body, /стратегическ.+анализ/i);
  assert.match(body, /Nisli/i);
  assert.match(body, /\]\(\/blog\/business-processes-before-automation\/\)/);
  assert.match(body, /\]\(\/blog\/ai-ops-business-automation-audit\/\)/);
  assert.match(body, /\]\(\/services\/ai-automation\/\)/);
  assert.match(body, /\]\(\/cases\/nisli\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 15_000, `article is too short: ${body.length} characters`);
});
