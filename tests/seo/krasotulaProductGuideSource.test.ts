import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "krasotulya-telegram-140";
const title = "Krasotula CRM для малого бизнеса: возможности и рабочие сценарии";

test("Krasotula product guide explains fit, modules and phased adoption", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "CRM для малого бизнеса — Krasotula");
  assert.equal(record.seoDescription, "Что должна объединять CRM для малого бизнеса: клиенты 360, продажи, задачи, онлайн-запись, коммуникации, склад, аналитика и автоматизация на примере Krasotula.");
  assert.equal(record.date, "19 июня 2026");
  assert.equal(record.updatedDate, "24 сентября 2026");
  assert.equal(record.readTime, "10 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /клиент[а-я ]+360/i);
  assert.match(body, /онлайн-запис/i);
  assert.match(body, /канбан/i);
  assert.match(body, /склад/i);
  assert.match(body, /ИИ-помощник/i);
  assert.match(body, /поэтап/i);
  assert.match(body, /не нужна/i);
  assert.match(body, /собственн.+продукт/i);
  assert.match(body, /\]\(\/blog\/krasotulya-online-booking\/\)/);
  assert.match(body, /\]\(\/blog\/krasotulya-telegram-121\/\)/);
  assert.match(body, /\]\(\/blog\/crm-implementation\/\)/);
  assert.match(body, /\]\(\/services\/crm-development\/\)/);
  assert.match(body, /\]\(\/cases\/krasotula-crm\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 14_000, `article is too short: ${body.length} characters`);
});
