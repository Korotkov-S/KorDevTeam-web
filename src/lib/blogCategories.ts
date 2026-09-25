export const BLOG_CATEGORY_SLUGS = [
  "business-automation",
  "crm-sales",
  "digital-products",
  "technical-support",
  "ai-for-business",
  "it-project-management",
] as const;

export type BlogCategorySlug = typeof BLOG_CATEGORY_SLUGS[number];

export type BlogCategoryDefinition = {
  slug: BlogCategorySlug;
  title: string;
  h1: string;
  seoTitle: string;
  seoDescription: string;
  intro: string;
  serviceHref: string;
  serviceLabel: string;
};

export const BLOG_CATEGORIES: readonly BlogCategoryDefinition[] = [
  {
    slug: "business-automation",
    title: "Автоматизация бизнеса",
    h1: "Автоматизация бизнеса",
    seoTitle: "Автоматизация бизнеса: процессы, интеграции и практические руководства",
    seoDescription: "Статьи KorDevTeam об описании и автоматизации бизнес-процессов, интеграциях, рассылках, калькуляторах и выборе между готовым решением и разработкой.",
    intro: "Практические материалы о том, как находить подходящие процессы для автоматизации, описывать текущую работу, выбирать инструменты и внедрять решения без лишней сложности.",
    serviceHref: "/services/business-process-automation/",
    serviceLabel: "Автоматизация бизнес-процессов",
  },
  {
    slug: "crm-sales",
    title: "CRM и управление продажами",
    h1: "CRM и управление продажами",
    seoTitle: "CRM и продажи: внедрение, воронки и клиентская база",
    seoDescription: "Руководства KorDevTeam по внедрению CRM, воронкам продаж, работе с клиентской базой, коммуникациям, повторным продажам и развитию Krasotula CRM.",
    intro: "Материалы о том, как связать заявки, переписки, задачи, сделки и повторные касания в одной управляемой системе.",
    serviceHref: "/services/crm-development/",
    serviceLabel: "Разработка и внедрение CRM",
  },
  {
    slug: "digital-products",
    title: "Разработка цифровых продуктов",
    h1: "Разработка цифровых продуктов",
    seoTitle: "Разработка цифровых продуктов: веб-сервисы, приложения и API",
    seoDescription: "Статьи KorDevTeam о разработке веб-сервисов, мобильных приложений, API, EdTech-платформ и продуктов со сложной бизнес-логикой.",
    intro: "Технические и продуктовые разборы архитектуры, пользовательских сценариев, интеграций и эксплуатации цифровых сервисов.",
    serviceHref: "/services/web-services/",
    serviceLabel: "Разработка веб-сервисов",
  },
  {
    slug: "technical-support",
    title: "Техническая поддержка сайтов",
    h1: "Техническая поддержка сайтов",
    seoTitle: "Техническая поддержка сайтов: диагностика и сопровождение",
    seoDescription: "Практические статьи KorDevTeam о поддержке сайтов, WordPress, доменах, DNS, доступности, учёте задач и безопасном сопровождении.",
    intro: "Инструкции по диагностике сбоев, управлению доменами, ускорению сайтов и организации прозрачной работы технической команды.",
    serviceHref: "/services/additional-service/",
    serviceLabel: "Техническая поддержка сайтов",
  },
  {
    slug: "ai-for-business",
    title: "ИИ для бизнеса",
    h1: "ИИ для бизнеса",
    seoTitle: "ИИ для бизнеса: выбор задачи, внедрение и аудит",
    seoDescription: "Статьи KorDevTeam о выборе задач для ИИ, безопасном внедрении, техническом аудите AI-автоматизаций и передаче диалога человеку.",
    intro: "Материалы о применении ИИ и чат-ботов без магических обещаний: от постановки задачи и пилота до контроля качества, безопасности и стоимости эксплуатации.",
    serviceHref: "/services/ai-automation/",
    serviceLabel: "ИИ-автоматизация",
  },
  {
    slug: "it-project-management",
    title: "Управление IT-проектами",
    h1: "Управление IT-проектами",
    seoTitle: "Управление IT-проектами: консалтинг, команда и переговоры",
    seoDescription: "Статьи KorDevTeam об IT-консалтинге, переговорах, планировании продукта, управлении задачами и работе с государственными заказчиками.",
    intro: "Практика подготовки решений, согласования требований, управления командой и контроля разработки на протяжении всего проекта.",
    serviceHref: "/services/additional-service/",
    serviceLabel: "IT-консалтинг и сопровождение",
  },
];

export function isBlogCategorySlug(value: unknown): value is BlogCategorySlug {
  return typeof value === "string" && BLOG_CATEGORY_SLUGS.includes(value as BlogCategorySlug);
}

export function getBlogCategory(value: unknown): BlogCategoryDefinition | undefined {
  return BLOG_CATEGORIES.find(category => category.slug === value);
}

export function blogCategoryPath(slug: BlogCategorySlug): string {
  return `/blog/category/${slug}/`;
}
