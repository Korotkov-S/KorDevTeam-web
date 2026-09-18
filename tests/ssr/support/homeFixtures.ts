import { createDb } from "../../../src/server/db/client";
import { contentEntries } from "../../../src/server/db/schema";

// The legacy import contains articles and cases, but no service records.
export async function seedHomeServices(databaseUrl: string) {
  const db = createDb(databaseUrl);
  await db.insert(contentEntries).values([
    ["web-services", "Заказная разработка"],
    ["mobile-app-development", "Мобильные приложения"],
    ["business-process-automation", "Интеграция и автоматизация бизнеса"],
    ["additional-service", "Поддержка цифровых продуктов"],
  ].map(([slug, title]) => ({
    kind: "service" as const, slug, title, status: "published" as const,
    excerpt: "Согласуем задачу и создадим решение для рабочих процессов команды.",
    seoTitle: title, seoDescription: "Разработка и сопровождение цифровых решений для бизнеса.",
    payload: { h1: title }, publishedAt: new Date("2026-09-01T00:00:00Z"),
  })));
  await db.insert(contentEntries).values({
    kind: "service", slug: "private-service", title: "PRIVATE_SERVICE_SENTINEL", status: "draft", payload: {},
  });
}
