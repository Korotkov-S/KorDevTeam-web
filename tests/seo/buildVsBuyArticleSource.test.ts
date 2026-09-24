import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "business-automation-without-custom-development";
const title = "Готовое решение или разработка с нуля: как выбрать для бизнеса";

test("build versus buy guide covers four options, ownership cost and a safe pilot", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "Готовое решение или разработка с нуля");
  assert.equal(record.seoDescription, "Как выбрать между готовым сервисом, настройкой, интеграцией и разработкой с нуля: критерии, полная стоимость владения, риски, пилот и примеры автоматизации.");
  assert.equal(record.date, "7 июля 2026");
  assert.equal(record.updatedDate, "24 сентября 2026");
  assert.equal(record.readTime, "10 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /четыр[её].+вариант/i);
  assert.match(body, /стоимост[ьи] владения/i);
  assert.match(body, /выгрузк.+данн/i);
  assert.match(body, /владел[ец]+ процесса/i);
  assert.match(body, /гибридн/i);
  assert.match(body, /пилот/i);
  assert.match(body, /поддержк.+после запуска/i);
  assert.match(body, /\]\(\/blog\/business-processes-before-automation\/\)/);
  assert.match(body, /\]\(\/blog\/business-automation\/\)/);
  assert.match(body, /\]\(\/blog\/stone-calculator-automation\/\)/);
  assert.match(body, /\]\(\/services\/business-process-automation\/\)/);
  assert.match(body, /\]\(\/services\/integrations\/\)/);
  assert.match(body, /\]\(\/services\/web-services\/\)/);
  assert.match(body, /\]\(\/cases\/stone-product-calculator\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 14_000, `article is too short: ${body.length} characters`);
});
