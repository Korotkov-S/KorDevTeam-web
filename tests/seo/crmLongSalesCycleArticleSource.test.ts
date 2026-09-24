import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "long-b2b-sales-cycle-crm";
const title = "Как не терять клиентов с длинным циклом сделки: CRM и следующий шаг";
const seoTitle = "Длинный цикл продаж в CRM: следующий шаг и контроль сделок";
const seoDescription = "Как вести длинную B2B-сделку в CRM: обязательные поля, этапы, следующий шаг, напоминания, повторные касания и контроль зависших клиентов.";
const excerpt = "Практическая система для длинных B2B-сделок: обязательные поля, следующий шаг, напоминания, повторные касания и контроль зависших клиентов.";
const headings = [
  "Почему длинная B2B-сделка теряется между касаниями",
  "Главное правило: у каждой сделки есть следующее действие",
  "Какие контакты заносить в CRM",
  "Что обязательно хранить в карточке сделки",
  "Пример воронки для длинной B2B-сделки",
  "Какие действия стоит автоматизировать",
  "Что контролировать руководителю",
  "Примеры сообщений после встречи",
  "Как мы сами работаем со сделками в Krasotula CRM",
  "Чек-лист настройки за один день",
  "Когда нужна доработка или собственная CRM",
  "Что делать дальше",
];

test("curated long-cycle CRM article gives a practical next-action workflow", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, seoTitle);
  assert.equal(record.seoDescription, seoDescription);
  assert.equal(record.excerpt, excerpt);
  assert.equal(record.date, "29 июля 2026");
  assert.equal(record.updatedDate, "24 сентября 2026");
  assert.equal(record.readTime, "9 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);
  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.deepEqual([...body.matchAll(/^##\s+(.+)$/gm)].map(match => match[1]), headings);
  assert.match(body, /сделк[аи]\s+без\s+следующего\s+(?:шага|действия)/i);
  assert.match(body, /### После знакомства/);
  assert.match(body, /### После отправки материалов/);
  assert.match(body, /### После согласованной паузы/);
  assert.match(body, /Геннадий[\s\S]+Krasotula CRM/);
  assert.match(body, /голосов(?:ой|ого)[\s\S]+разрабатыва/i);
  assert.match(body, /\]\(\/services\/crm-development\/\)/);
  assert.match(body, /\]\(\/cases\/krasotula-crm\/\)/);
  assert.match(body, /\]\(\/blog\/crm-implementation\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.ok(body.length >= 8_000, `article is too short: ${body.length} characters`);
});
