import { createDb } from "../../../src/server/db/client";
import { contentEntries } from "../../../src/server/db/schema";
import { applyPortfolioImport, planPortfolioImport } from "../../../src/server/portfolio/importer";
import { loadPortfolioSources } from "../../../src/server/portfolio/loader";

const publishedAt = new Date("2026-09-18T09:00:00.000Z");

function servicePayload(title: string) {
  return {
    h1: title,
    lead: "Проектируем и запускаем цифровое решение под реальный рабочий процесс команды.",
    problems: ["Ручные операции замедляют работу", "Данные остаются в разрозненных системах"],
    solutions: ["Собираем единый рабочий сценарий", "Соединяем необходимые сервисы и данные"],
    integrations: ["CRM", "Учётная система", "Внешние API"],
    technologies: ["TypeScript", "PostgreSQL"],
    processSteps: [
      { title: "Исследование", description: "Фиксируем задачу, ограничения и критерии результата." },
      { title: "Запуск", description: "Проверяем ключевые сценарии и передаём решение команде." },
    ],
    priceFactors: ["Количество процессов", "Состав интеграций"],
    timeRange: "После обследования задачи",
    ctaTitle: "Обсудить проект",
    ctaText: "Ответим в течение рабочего дня и предложим следующий шаг.",
    ctaType: "form",
    results: [{ title: "Управляемый процесс", description: "Команда работает в одном понятном цифровом контуре." }],
    guarantees: [{ title: "Прозрачные этапы", description: "Показываем промежуточный результат и документируем решение." }],
  };
}

export async function seedCommercialFixtures(databaseUrl: string): Promise<void> {
  const db = createDb(databaseUrl);
  const services = [
    ["business-process-automation", "Интеграция и автоматизация бизнеса"],
    ["web-services", "Заказная разработка"],
    ["mobile-app-development", "Мобильные приложения"],
    ["crm-development", "Разработка CRM"],
    ["integrations", "Интеграция информационных систем"],
    ["ai-automation", "Автоматизация с искусственным интеллектом"],
  ] as const;

  await db.insert(contentEntries).values(services.map(([slug, title], index) => ({
    kind: "service" as const,
    slug,
    status: "published" as const,
    title,
    excerpt: "Создаём надёжные инструменты для ежедневной работы бизнеса.",
    bodyMd: "## Как работаем\n\nИзучаем действующий процесс, согласуем архитектуру и запускаем решение по этапам.",
    seoTitle: title,
    seoDescription: `KorDevTeam: ${title.toLocaleLowerCase("ru-RU")} для бизнеса.`,
    payload: servicePayload(title),
    publishedAt: new Date(publishedAt.getTime() + index * 1_000),
  })));

  const portfolioSources = await loadPortfolioSources();
  await applyPortfolioImport(db, await planPortfolioImport(db, portfolioSources));

  await db.insert(contentEntries).values([
    {
      kind: "case" as const,
      slug: "long-case",
      status: "published" as const,
      title: "Автоматизация многоэтапного согласования заявок для распределённой команды без потери прозрачности процессов",
      excerpt: "Объединили заявки, статусы и уведомления в одном рабочем пространстве.",
      bodyMd: "## Результат\n\nКоманда видит состояние каждой заявки и быстрее принимает решения.",
      seoTitle: "Автоматизация согласования заявок — кейс KorDevTeam",
      seoDescription: "Кейс автоматизации многоэтапного согласования заявок для распределённой команды.",
      payload: {
        h1: "Автоматизация многоэтапного согласования заявок для распределённой команды без потери прозрачности процессов",
        problem: "Участники согласования работали в разных системах и теряли контекст.",
        constraints: ["Существующая CRM", "Распределённая команда"],
        solution: "Создали единый маршрут заявки с прозрачными статусами и уведомлениями.",
        architecture: "Веб-приложение, PostgreSQL и интеграционный API.",
        integrations: ["CRM", "Корпоративная почта"],
        stages: [{ title: "Проектирование", description: "Описали роли и маршруты согласования." }],
        team: ["Аналитик", "Разработчик"],
        screenshots: [],
        results: [{ title: "Единый процесс", description: "Все участники работают с актуальным статусом заявки." }],
        testimonial: "Теперь ход согласования понятен всей команде.",
        cta: { copy: "Разберём ваш процесс", type: "form" },
      },
      publishedAt,
    },
    {
      kind: "case" as const,
      slug: "crm-rollout",
      status: "published" as const,
      title: "Запуск CRM для отдела продаж",
      excerpt: "Настроили воронку и связали обращения с рабочими задачами.",
      bodyMd: "## Решение\n\nПеренесли работу отдела продаж в управляемую воронку.",
      seoTitle: "Запуск CRM — кейс KorDevTeam",
      seoDescription: "Кейс запуска CRM для отдела продаж.",
      payload: { screenshots: [], results: [{ title: "Прозрачная воронка", description: "Руководитель видит актуальную загрузку отдела." }] },
      publishedAt: new Date(publishedAt.getTime() + 1_000),
    },
    {
      kind: "case" as const,
      slug: "mobile-workplace",
      status: "published" as const,
      title: "Мобильное рабочее место выездного специалиста",
      excerpt: "Дали сотрудникам быстрый доступ к заданиям и истории работ.",
      bodyMd: "## Решение\n\nПриложение работает с заданиями и синхронизирует результаты.",
      seoTitle: "Мобильное рабочее место — кейс KorDevTeam",
      seoDescription: "Кейс мобильного приложения для выездных специалистов.",
      payload: { screenshots: [], results: [{ title: "Меньше ручного ввода", description: "Результат работы сразу попадает в систему." }] },
      publishedAt: new Date(publishedAt.getTime() + 2_000),
    },
  ]);

  await db.insert(contentEntries).values([
    {
      kind: "article" as const,
      slug: "long-article",
      status: "published" as const,
      title: "Как подготовить процессы компании к автоматизации и не перенести старые ограничения в новую систему",
      excerpt: "Практический разбор подготовки процессов, данных и команды к изменениям.",
      bodyMd: "## Сначала процесс\n\nЗафиксируйте цель, участников и исключения до выбора технологии.\n\n## Затем данные\n\nОпределите источник правды и правила обновления информации.",
      seoTitle: "Как подготовить процессы к автоматизации",
      seoDescription: "Практический разбор подготовки процессов компании к автоматизации.",
      payload: { h1: "Как подготовить процессы компании к автоматизации и не перенести старые ограничения в новую систему", tags: ["Автоматизация", "Процессы"], readTime: "7 минут" },
      publishedAt: new Date(publishedAt.getTime() + 3_000),
    },
    {
      kind: "article" as const,
      slug: "integration-checklist",
      status: "published" as const,
      title: "Чек-лист надёжной интеграции",
      excerpt: "Что проверить до подключения внешней системы.",
      bodyMd: "## Контракт\n\nСогласуйте формат данных, ошибки и повторные попытки.",
      seoTitle: "Чек-лист надёжной интеграции",
      seoDescription: "Проверки перед подключением внешней системы.",
      payload: { tags: ["Интеграции"], readTime: "4 минуты" },
      publishedAt: new Date(publishedAt.getTime() + 4_000),
    },
  ]);
}
