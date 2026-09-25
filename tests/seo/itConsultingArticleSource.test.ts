import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "software-development-to-it-consulting";
const title = "ИТ-консалтинг: что входит в услугу и какой результат получает бизнес";

test("IT consulting guide defines scope, deliverables and a decision-ready roadmap", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, "ИТ-консалтинг: этапы и результат для бизнеса");
  assert.equal(record.seoDescription, "Что такое ИТ-консалтинг, когда он нужен бизнесу, как проходит обследование и какие результаты получает заказчик: процессы, варианты решений, требования и дорожная карта.");
  assert.equal(record.date, "31 августа 2026");
  assert.equal(record.updatedDate, "25 сентября 2026");
  assert.equal(record.readTime, "10 мин");
  assert.equal(record.coverUrl, "");
  assert.deepEqual(record.imageUrls, []);

  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.equal(body.match(/^#\s+/gm)?.length, 1);
  assert.match(body, /AS IS/i);
  assert.match(body, /TO BE/i);
  assert.match(body, /готов.+сервис.+интеграц.+разработ/is);
  assert.match(body, /полн.+стоимост.+владен/i);
  assert.match(body, /критери.+при[её]мк/i);
  assert.match(body, /реестр.+риск/i);
  assert.match(body, /дорожн.+карт/i);
  assert.match(body, /TBI Group/i);
  assert.match(body, /люб.+подрядчик|друг.+подрядчик/i);
  assert.match(body, /когда.+консалтинг.+не нужен/is);
  assert.match(body, /\]\(\/blog\/business-processes-before-automation\/\)/);
  assert.match(body, /\]\(\/blog\/business-automation-without-custom-development\/\)/);
  assert.match(body, /\]\(\/services\/business-process-automation\/\)/);
  assert.match(body, /\]\(\/services\/integrations\/\)/);
  assert.match(body, /\]\(\/cases\/tbi-group-tour-service\/\)/);
  assert.doesNotMatch(body, /!\[[^\]]*\]\(/);
  assert.doesNotMatch(body, /^\|/m);
  assert.ok(body.length >= 15_000, `article is too short: ${body.length} characters`);
});
