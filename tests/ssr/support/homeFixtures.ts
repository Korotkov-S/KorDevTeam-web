import { createDb } from "../../../src/server/db/client";
import { contentEntries } from "../../../src/server/db/schema";

// The legacy import contains articles and cases, but no service records.
export async function seedHomeServices(databaseUrl: string) {
  const db = createDb(databaseUrl);
  const servicePayload = (title: string) => ({
    h1: title,
    lead: "Разбираем текущий процесс, проектируем решение и запускаем его без лишней ручной работы.",
    problems: ["Разрозненные системы замедляют команду", "Повторяющиеся операции отнимают рабочее время"],
    solutions: ["Проектируем решение под действующие процессы", "Соединяем данные и рабочие инструменты"],
    integrations: ["CRM", "Учётные системы", "Внешние API"],
    technologies: ["TypeScript", "PostgreSQL"],
    processSteps: [
      { title: "Погружение", description: "Фиксируем задачу, ограничения и критерии готовности." },
      { title: "Запуск", description: "Проверяем рабочие сценарии и передаём решение команде." },
    ],
    priceFactors: ["Объём процессов", "Количество интеграций"],
    timeRange: "Определяем после обследования",
    ctaTitle: "Обсудить задачу",
    ctaText: "Опишите ваш процесс — предложим следующий шаг в течение рабочего дня.",
    ctaType: "form" as const,
    results: [{ title: "Рабочий цифровой процесс", description: "Сотрудники получают единый понятный инструмент для ежедневных задач." }],
    guarantees: [{ title: "Прозрачная работа", description: "Согласуем этапы, показываем результат и остаёмся на связи после запуска." }],
  });
  await db.insert(contentEntries).values([
    ["web-services", "Заказная разработка"],
    ["mobile-app-development", "Мобильные приложения"],
    ["business-process-automation", "Интеграция и автоматизация бизнеса"],
    ["crm-development", "Разработка CRM"],
    ["integrations", "Интеграция информационных систем"],
    ["ai-automation", "Автоматизация с искусственным интеллектом"],
    ["additional-service", "Поддержка цифровых продуктов"],
  ].map(([slug, title]) => ({
    kind: "service" as const, slug, title, status: "published" as const,
    excerpt: "Согласуем задачу и создадим решение для рабочих процессов команды.",
    seoTitle: title, seoDescription: "Разработка и сопровождение цифровых решений для бизнеса.",
    bodyMd: "Работаем с существующей инфраструктурой, документируем решение и учитываем дальнейшее развитие продукта.",
    payload: servicePayload(title), publishedAt: new Date("2026-09-01T00:00:00Z"),
  })));
  await db.insert(contentEntries).values({
    kind: "service", slug: "private-service", title: "PRIVATE_SERVICE_SENTINEL", status: "draft", payload: {},
  });
}
