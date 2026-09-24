import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "krasotulya-online-booking";
const title = "Онлайн-запись клиентов: как настроить расписание, напоминания и CRM";

test("online booking guide covers the client path, scheduling rules and CRM workflow", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "Онлайн-запись клиентов: настройка и CRM");
  assert.equal(record.seoDescription, "Как настроить онлайн-запись клиентов: расписание, свободные слоты, отмены, напоминания, интеграция с CRM и аналитика сервисного бизнеса.");
  assert.equal(record.date, "3 февраля 2026");
  assert.equal(record.updatedDate, "24 сентября 2026");
  assert.equal(record.readTime, "9 мин");

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /свободн.+слот/i);
  assert.match(body, /двойн.+запис/i);
  assert.match(body, /отмен.+перенос/i);
  assert.match(body, /напоминан/i);
  assert.match(body, /источник.+запис/i);
  assert.match(body, /неявк/i);
  assert.match(body, /Krasotula CRM/);
  assert.match(body, /Google.+Яндекс\.Календар/i);
  assert.match(body, /Telegram/i);
  assert.match(body, /\]\(\/blog\/crm-implementation\/\)/);
  assert.match(body, /\]\(\/blog\/krasotulya-telegram-121\/\)/);
  assert.match(body, /\]\(\/services\/crm-development\/\)/);
  assert.match(body, /\]\(\/services\/web-services\/\)/);
  assert.match(body, /\]\(\/cases\/krasotula-crm\/\)/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 12_000, `article is too short: ${body.length} characters`);
});
