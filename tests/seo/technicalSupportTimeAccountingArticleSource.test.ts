import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "technical-support-debt-time-tracking";
const title = "Техническая поддержка сайта: как учитывать часы, задачи и оплату";

test("technical support guide connects task evidence, hour limits and payment control", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "Учёт часов технической поддержки сайта");
  assert.equal(record.seoDescription, "Как организовать техническую поддержку сайта: пакет часов, Kanban-доска, ежедневные статусы, согласование перерасхода, отчёт, документы и контроль оплаты.");
  assert.equal(record.date, "31 августа 2026");
  assert.equal(record.updatedDate, "25 сентября 2026");
  assert.equal(record.readTime, "10 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /20 часов/i);
  assert.match(body, /1.?900 ₽|1900 (?:руб|₽)/i);
  assert.match(body, /публичн.+Kanban-доск/i);
  assert.match(body, /ежедневн.+статус/i);
  assert.match(body, /по понедельникам/i);
  assert.match(body, /перерасход/i);
  assert.match(body, /критери.+при[её]мк/i);
  assert.match(body, /спорн.+сумм/i);
  assert.match(body, /MCP-доступ/i);
  assert.match(body, /ChatGPT/i);
  assert.match(body, /дебитор/i);
  assert.match(body, /чек-лист.+закрыти.+месяц/is);
  assert.match(body, /когда.+почасов.+модель.+не подходит/is);
  assert.match(body, /\]\(\/services\/additional-service\/\)/);
  assert.match(body, /\]\(\/blog\/ai-ops-business-automation-audit\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 14_000, `article is too short: ${body.length} characters`);
});
