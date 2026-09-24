import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "krasotulya-telegram-121";
const title = "Воронка продаж в CRM: как настроить этапы и критерии перехода";

test("CRM funnel guide keeps actionable stages, transition rules and diagnostics", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "Воронка продаж в CRM: этапы и настройка");
  assert.equal(record.seoDescription, "Как настроить воронку продаж в CRM: этапы, критерии перехода, обязательные поля, автоматизации, конверсия и контроль зависших сделок.");
  assert.equal(record.date, "2 июня 2026");
  assert.equal(record.updatedDate, "24 сентября 2026");
  assert.equal(record.readTime, "9 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /критери[ийя].+переход/i);
  assert.match(body, /входа.+выхода/i);
  assert.match(body, /конверси/i);
  assert.match(body, /время.+этап/i);
  assert.match(body, /десят[ьи] реальн.+карточ/i);
  assert.match(body, /Krasotula CRM/);
  assert.match(body, /\]\(\/blog\/crm-implementation\/\)/);
  assert.match(body, /\]\(\/blog\/long-b2b-sales-cycle-crm\/\)/);
  assert.match(body, /\]\(\/blog\/business-processes-before-automation\/\)/);
  assert.match(body, /\]\(\/services\/crm-development\/\)/);
  assert.match(body, /\]\(\/cases\/krasotula-crm\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 12_000, `article is too short: ${body.length} characters`);
});
