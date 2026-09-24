import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "crm-implementation";
const title = "Внедрение CRM-системы: этапы, план запуска и контроль результата";

test("CRM implementation guide keeps a practical launch and acceptance workflow", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "Внедрение CRM-системы: этапы и план запуска");
  assert.equal(record.seoDescription, "Пошаговый план внедрения CRM: обследование процессов, требования, перенос данных, интеграции, пилот, обучение сотрудников и критерии приёмки.");
  assert.equal(record.date, "12 октября 2025");
  assert.equal(record.updatedDate, "24 сентября 2026");
  assert.equal(record.readTime, "11 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /критери[ия] при[её]мки/i);
  assert.match(body, /контрольн(?:ая|ую) выборк/i);
  assert.match(body, /пилот/i);
  assert.match(body, /первые 30 дней/i);
  assert.match(body, /ТехАрматур/i);
  assert.match(body, /WoWBanner/);
  assert.match(body, /Krasotula/);
  assert.match(body, /\]\(\/services\/crm-development\/\)/);
  assert.match(body, /\]\(\/blog\/business-processes-before-automation\/\)/);
  assert.match(body, /\]\(\/blog\/long-b2b-sales-cycle-crm\/\)/);
  assert.match(body, /\]\(\/cases\/teharmatura-automation\/\)/);
  assert.match(body, /\]\(\/cases\/wowbanner\/\)/);
  assert.match(body, /\]\(\/cases\/krasotula-crm\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 12_000, `article is too short: ${body.length} characters`);
});
