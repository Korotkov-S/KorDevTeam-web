# Категории блога и системная перелинковка — спецификация

Дата: 25 сентября 2026 года.

## Цель

Объединить 46 опубликованных статей KorDevTeam в понятные тематические кластеры, создать индексируемые страницы категорий и добавить управляемую перелинковку между материалами. Решение должно помогать посетителю переходить от информационной статьи к следующему полезному материалу, кейсу или услуге и одновременно объяснять поисковым системам структуру экспертизы сайта.

## Исходное состояние

- Блог доступен по адресу /blog/ и выводит все опубликованные статьи с пагинацией.
- Статья доступна по адресу /blog/:slug/.
- В payload статьи хранятся автор, теги, обложка, изображения и время чтения.
- Теги неоднородны и не подходят для построения стабильных индексируемых URL.
- В текстах статей уже существуют ручные ссылки на услуги, кейсы и отдельные статьи.
- Стабильных категорий, страниц тематических кластеров и блока связанных статей нет.

## Принятые решения

1. У каждой статьи ровно одна основная категория.
2. Существующие теги сохраняются как визуальные метки и не получают отдельных URL.
3. Создаются шесть индексируемых страниц категорий.
4. Для каждой статьи вручную задаются три связанные статьи.
5. Категория и связанные slug хранятся в метаданных статьи и синхронизируются в payload записи.
6. Существующая таблица content_relations и административная панель в эту итерацию не изменяются.
7. Категории выводят все свои статьи без отдельной пагинации. Самая крупная категория содержит 18 карточек, что допустимо для текущего каталога и оставляет все ссылки доступными в SSR.
8. Существующая пагинация общего блога сохраняется без изменения.

## Категории и URL

### Автоматизация бизнеса

- Slug: business-automation
- URL: /blog/category/business-automation/
- H1: Автоматизация бизнеса
- SEO title: Автоматизация бизнеса: процессы, интеграции и практические руководства
- Description: Статьи KorDevTeam об описании и автоматизации бизнес-процессов, интеграциях, рассылках, калькуляторах и выборе между готовым решением и разработкой.
- Вступление: Практические материалы о том, как находить подходящие процессы для автоматизации, описывать текущую работу, выбирать инструменты и внедрять решения без лишней сложности.
- Профильная услуга: /services/business-process-automation/

### CRM и продажи

- Slug: crm-sales
- URL: /blog/category/crm-sales/
- H1: CRM и управление продажами
- SEO title: CRM и продажи: внедрение, воронки и клиентская база
- Description: Руководства KorDevTeam по внедрению CRM, воронкам продаж, работе с клиентской базой, коммуникациям, повторным продажам и развитию Krasotula CRM.
- Вступление: Материалы о том, как связать заявки, переписки, задачи, сделки и повторные касания в одной управляемой системе.
- Профильная услуга: /services/crm-development/

### Разработка цифровых продуктов

- Slug: digital-products
- URL: /blog/category/digital-products/
- H1: Разработка цифровых продуктов
- SEO title: Разработка цифровых продуктов: веб-сервисы, приложения и API
- Description: Статьи KorDevTeam о разработке веб-сервисов, мобильных приложений, API, EdTech-платформ и продуктов со сложной бизнес-логикой.
- Вступление: Технические и продуктовые разборы архитектуры, пользовательских сценариев, интеграций и эксплуатации цифровых сервисов.
- Профильная услуга: /services/web-services/

### Техническая поддержка

- Slug: technical-support
- URL: /blog/category/technical-support/
- H1: Техническая поддержка сайтов
- SEO title: Техническая поддержка сайтов: диагностика и сопровождение
- Description: Практические статьи KorDevTeam о поддержке сайтов, WordPress, доменах, DNS, доступности, учёте задач и безопасном сопровождении.
- Вступление: Инструкции по диагностике сбоев, управлению доменами, ускорению сайтов и организации прозрачной работы технической команды.
- Профильная услуга: /services/additional-service/

### ИИ для бизнеса

- Slug: ai-for-business
- URL: /blog/category/ai-for-business/
- H1: ИИ для бизнеса
- SEO title: ИИ для бизнеса: выбор задачи, внедрение и аудит
- Description: Статьи KorDevTeam о выборе задач для ИИ, безопасном внедрении, техническом аудите AI-автоматизаций и передаче диалога человеку.
- Вступление: Материалы о применении ИИ и чат-ботов без магических обещаний: от постановки задачи и пилота до контроля качества, безопасности и стоимости эксплуатации.
- Профильная услуга: /services/ai-automation/

### Управление IT-проектами

- Slug: it-project-management
- URL: /blog/category/it-project-management/
- H1: Управление IT-проектами
- SEO title: Управление IT-проектами: консалтинг, команда и переговоры
- Description: Статьи KorDevTeam об IT-консалтинге, переговорах, планировании продукта, управлении задачами и работе с государственными заказчиками.
- Вступление: Практика подготовки решений, согласования требований, управления командой и контроля разработки на протяжении всего проекта.
- Профильная услуга: /services/additional-service/

## Модель данных

Каждая русскоязычная статья в public/content/blog.ru.json получает обязательные поля:

    "category": "crm-sales",
    "relatedArticleSlugs": [
      "crm-implementation",
      "long-b2b-sales-cycle-crm",
      "krasotulya-telegram-121"
    ]

Payload опубликованной статьи расширяется полями:

- category: один slug из фиксированного набора шести категорий;
- relatedArticleSlugs: массив ровно из трёх уникальных slug.

Тип BlogCategorySlug и конфигурация категорий должны находиться в одном общем модуле, доступном маршрутам, серверной валидации и компонентам. Свободная строка категории в прикладном коде не используется.

## Карта статей и связей

Связанные статьи перечислены в требуемом порядке отображения.

### business-automation

- max-comments-business-process → business-processes-before-automation, business-automation, telegram-broadcast-automation
- business-processes-before-automation → business-automation, business-automation-without-custom-development, stone-calculator-automation
- business-automation-without-custom-development → business-processes-before-automation, business-automation, software-development-to-it-consulting
- krasotulya-telegram-118 → telegram-broadcast-automation, krasotulya-problem-4-email-campaigns, krasotulya-telegram-108
- business-automation → business-processes-before-automation, business-automation-without-custom-development, stone-calculator-automation
- stone-calculator-automation → business-processes-before-automation, business-automation, business-automation-without-custom-development
- telegram-broadcast-automation → krasotulya-telegram-118, krasotulya-problem-4-email-campaigns, krasotulya-telegram-108

### crm-sales

- long-b2b-sales-cycle-crm → krasotulya-telegram-122, krasotulya-telegram-109, crm-implementation
- krasotulya-telegram-140 → crm-implementation, krasotulya-online-booking, krasotulya-telegram-120
- krasotulya-telegram-139 → react-native-best-practices, krasotulya-telegram-140, krasotulya-telegram-108
- krasotulya-telegram-122 → long-b2b-sales-cycle-crm, krasotulya-telegram-111, krasotulya-telegram-109
- krasotulya-telegram-121 → crm-implementation, krasotulya-telegram-109, long-b2b-sales-cycle-crm
- krasotulya-telegram-120 → krasotulya-telegram-140, krasotulya-problem-1-data-fragmentation, crm-implementation
- krasotulya-telegram-117 → krasotulya-telegram-120, krasotulya-telegram-105, krasotulya-telegram-109
- krasotulya-telegram-115 → krasotulya-problem-4-email-campaigns, telegram-broadcast-automation, krasotulya-telegram-118
- krasotulya-telegram-112 → krasotulya-problem-4-email-campaigns, long-b2b-sales-cycle-crm, krasotulya-telegram-122
- krasotulya-telegram-111 → krasotulya-telegram-122, offline-packaging-for-it-studio, krasotulya-telegram-110
- krasotulya-telegram-110 → krasotulya-telegram-109, krasotulya-telegram-119, krasotulya-telegram-105
- krasotulya-telegram-109 → long-b2b-sales-cycle-crm, krasotulya-telegram-121, krasotulya-telegram-110
- krasotulya-telegram-108 → krasotulya-telegram-116, telegram-broadcast-automation, krasotulya-telegram-140
- krasotulya-online-booking → crm-implementation, krasotulya-telegram-140, krasotulya-problem-1-data-fragmentation
- krasotulya-problem-4-email-campaigns → krasotulya-telegram-112, krasotulya-telegram-115, telegram-broadcast-automation
- krasotulya-crm-launch → krasotulya-telegram-140, krasotulya-landing-launch, crm-implementation
- krasotulya-problem-1-data-fragmentation → crm-implementation, krasotulya-telegram-120, krasotulya-telegram-140
- crm-implementation → krasotulya-problem-1-data-fragmentation, krasotulya-telegram-121, krasotulya-online-booking

### digital-products

- krasotulya-landing-launch → krasotulya-crm-launch, krasotulya-telegram-139, harmonize-me-story
- react-native-best-practices → nodejs-microservices, laravel-api-development, krasotulya-telegram-139
- nodejs-microservices → laravel-api-development, sims-dynasty-tree-platform, harmonize-me-platform
- laravel-api-development → nodejs-microservices, harmonize-me-platform, sims-dynasty-tree-platform
- harmonize-me-story → harmonize-me-platform, business-automation-without-custom-development, sims-dynasty-tree-platform
- sims-dynasty-tree-platform → harmonize-me-platform, nodejs-microservices, react-native-best-practices
- harmonize-me-platform → harmonize-me-story, nodejs-microservices, laravel-api-development

### technical-support

- technical-support-debt-time-tracking → wordpress-optimization, krasotulya-telegram-138, krasotulya-telegram-130
- krasotulya-telegram-138 → krasotulya-telegram-130, wordpress-optimization, technical-support-debt-time-tracking
- krasotulya-telegram-130 → krasotulya-telegram-138, wordpress-optimization, technical-support-debt-time-tracking
- wordpress-optimization → krasotulya-telegram-138, krasotulya-telegram-130, technical-support-debt-time-tracking

### ai-for-business

- ai-ops-business-automation-audit → ai-business-strategy-without-hype, krasotulya-telegram-116, business-automation-without-custom-development
- ai-business-strategy-without-hype → ai-ops-business-automation-audit, krasotulya-telegram-116, business-processes-before-automation
- krasotulya-telegram-116 → ai-business-strategy-without-hype, ai-ops-business-automation-audit, krasotulya-telegram-108

### it-project-management

- software-development-to-it-consulting → government-contractors-guide, argumentation-guide, business-processes-before-automation
- offline-packaging-for-it-studio → krasotulya-telegram-111, long-b2b-sales-cycle-crm, argumentation-guide
- krasotulya-telegram-119 → krasotulya-telegram-105, krasotulya-telegram-107, krasotulya-telegram-109
- krasotulya-telegram-107 → krasotulya-telegram-105, krasotulya-telegram-119, software-development-to-it-consulting
- krasotulya-telegram-105 → krasotulya-telegram-119, krasotulya-telegram-107, technical-support-debt-time-tracking
- government-contractors-guide → argumentation-guide, software-development-to-it-consulting, business-processes-before-automation
- argumentation-guide → government-contractors-guide, long-b2b-sales-cycle-crm, software-development-to-it-consulting

## Поток данных

1. public/content/blog.ru.json остаётся версионируемым источником редакционной таксономии.
2. scripts/sync-articles.ts загружает выбранную запись.
3. src/server/content/articleSources.ts проверяет category и relatedArticleSlugs вместе с существующими полями.
4. Валидированные значения записываются в payload существующей статьи без изменения её URL, даты первой публикации и связанных медиа.
5. Маршрут статьи читает category и relatedArticleSlugs из payload.
6. Связанные карточки разрешаются только среди опубликованных article-записей и сохраняют заданный порядок.
7. Маршрут категории фильтрует опубликованные записи по payload.category.
8. Конфигурация категории предоставляет H1, SEO-метаданные, вступление и ссылку на услугу.

## Пользовательский интерфейс

### Общая страница блога

Под существующим заголовком и до списка статей выводится компактный блок из шести категорий. Каждая карточка содержит название, короткое описание и количество опубликованных статей. Карточка является обычной SSR-ссылкой.

### Страница категории

Страница использует общий публичный визуальный язык сайта:

- хлебные крошки Блог → Категория;
- H1 и вступительный текст;
- ссылка на профильную услугу;
- сетка всех статей категории;
- дата, время чтения и основные теги на карточках;
- сообщение не выводится для пустой категории, потому что такой URL возвращает 404.

### Страница статьи

Существующая ссылка возврата дополняется семантическими хлебными крошками Блог → Категория. Название категории является ссылкой.

После основного материала и блока автора, но до финальной кнопки возврата, выводится секция «Читайте также» из трёх карточек. Ссылки и карточки присутствуют в SSR-разметке.

## SEO

- Каждая категория indexable и имеет собственный canonical.
- Категории используют kind page в существующей модели метаданных.
- В sitemap-blog.xml добавляются шесть URL категорий.
- lastmod категории равен максимальному updatedAt опубликованной статьи внутри категории.
- Страницы категорий не создают URL для тегов.
- Общий блог и статьи сохраняют существующие canonical.
- Категории не меняют URL статей и не требуют редиректов.
- H1 страницы категории существует в единственном экземпляре.
- Карточки используют существующую BlogPosting и ItemList-разметку.

## Валидация и ошибки

Источник статьи считается недействительным, если:

- category отсутствует или не входит в фиксированный набор;
- relatedArticleSlugs содержит не три элемента;
- slug повторяется;
- статья ссылается сама на себя;
- связанного slug нет в русскоязычном каталоге;
- категория не содержит ни одной статьи после полной проверки каталога.

Неизвестный slug категории возвращает 404 с documentHeaders.

Если связанная статья существует в каталоге, но не опубликована, страница исходной статьи продолжает работать и не показывает отсутствующую карточку. Это не меняет порядок оставшихся карточек.

Если категория временно не содержит опубликованных статей, публичный URL возвращает 404 и не попадает в sitemap.

## Область изменений

Планируемые области:

- общий тип и конфигурация категорий;
- схема и загрузчик источников статей;
- метаданные 46 статей;
- presentation-типы;
- маршрут и страница категории;
- общая страница блога;
- страница статьи и блок связанных материалов;
- маршрутизация;
- sitemap блога;
- тесты компонентов, загрузчиков, sitemap и crawler.

Не входят в эту итерацию:

- страницы отдельных тегов;
- изменение текстов 46 статей;
- автоматическое редактирование ссылок внутри Markdown;
- изменение таблицы content_relations;
- интерфейс управления категориями и связями в админке;
- новые редиректы;
- изменение URL существующих статей.

## Критерии приёмки

1. Все 46 статей проходят валидацию и имеют одну категорию и три связанные статьи.
2. Все шесть URL категорий возвращают 200, имеют уникальные H1, title, description и canonical.
3. Неизвестная категория возвращает 404.
4. Общий блог содержит шесть SSR-ссылок на категории.
5. Каждая статья содержит SSR-ссылку на свою категорию и до трёх опубликованных связанных материалов.
6. Ни одна связанная карточка не ссылается на текущую статью и не повторяется.
7. sitemap-blog.xml содержит опубликованные статьи и непустые категории без дублей.
8. Все новые внутренние ссылки возвращают 200.
9. На ширине 390 px нет горизонтального переполнения, обрезанных заголовков и сломанных изображений.
10. Фокусные тесты, typecheck и production-сборка проходят.

## Риски и ограничения

- Ручная карта требует обновления при каждой новой статье. Валидатор должен превращать пропуск в явную ошибку синхронизации или теста.
- Категория CRM заметно крупнее остальных. На текущем объёме все 18 карточек выводятся без пагинации; при существенном росте каталога пагинация проектируется отдельно.
- Автоматические рекомендации по тегам не используются, поэтому качество блока зависит от редакционной карты.
- Источник метаданных и база должны синхронизироваться перед визуальной проверкой категории.
