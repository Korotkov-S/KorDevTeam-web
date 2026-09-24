import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const slug = "business-processes-before-automation";
const title = "Описание бизнес-процессов: как подготовить процесс к автоматизации";
const seoTitle = "Описание бизнес-процессов перед автоматизацией: этапы и пример";
const seoDescription = "Как описать бизнес-процесс AS IS, найти потери, спроектировать TO BE и подготовить требования к автоматизации: этапы, таблица и практический пример.";
const excerpt = "Пошагово описываем бизнес-процесс AS IS, находим потери и готовим модель TO BE перед внедрением CRM, интеграции или заказной системы.";
const headings = [
  "Что должно получиться в результате",
  "Как выбрать первый процесс для описания",
  "Что собрать до схемы",
  "Как описать бизнес-процесс AS IS",
  "Пример описания процесса обработки заявки",
  "Когда достаточно текста и таблицы",
  "Когда нужна BPMN",
  "Как найти потери в текущем процессе",
  "Как перейти от AS IS к TO BE",
  "Что передать команде разработки",
  "Типичные ошибки",
  "Чек-лист готовности процесса к автоматизации",
  "Что делать дальше",
];
const imageAlts = {
  "01": "Геннадий Коротков выступает перед участниками деловой встречи",
  "02": "Участники деловой встречи после обсуждения",
  "03": "Участницы встречи в зале с книжными стеллажами",
  "04": "Участницы деловой встречи за большим столом",
  "05": "Вид на зелёный ландшафт с открытой террасы",
  "06": "Интерьер зала с сервированным столом и панорамным окном",
};

test("curated business-process article satisfies its SEO source contract", async () => {
  const root = process.cwd();
  const body = await readFile(path.join(root, "public", "blog", `${slug}.md`), "utf8");
  const metadata = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
  const record = metadata.find((item: { slug?: string }) => item.slug === slug);

  assert.ok(record);
  assert.equal(record.title, title);
  assert.equal(record.seoTitle, seoTitle);
  assert.equal(record.seoDescription, seoDescription);
  assert.equal(record.excerpt, excerpt);
  assert.equal(record.updatedDate, "24 сентября 2026");
  assert.equal(record.readTime, "9 мин");
  assert.equal(body.match(/^#\s+(.+)$/m)?.[1], title);
  assert.deepEqual([...body.matchAll(/^##\s+(.+)$/gm)].map(match => match[1]), headings);
  assert.match(body, /\| Шаг \| Участник \| Вход \| Действие \| Результат \| Система \| Срок \| Исключение \|/);
  assert.match(body, /код усиливает порядок[\s\S]+усиливает беспорядок/i);
  assert.match(body, /\]\(\/services\/business-process-automation\/\)/);
  assert.match(body, /\]\(\/cases\/teharmatura-automation\/\)/);
  const actualAlts = Object.fromEntries(
    [...body.matchAll(/!\[([^\]]+)\]\(\/blog\/media\/korotkovsStudio\/1130-(0[1-6])\.jpg\)/g)]
      .map(match => [match[2], match[1]]),
  );
  assert.deepEqual(actualAlts, imageAlts);
  assert.ok(body.length >= 8_000, `article is too short: ${body.length} characters`);
});
