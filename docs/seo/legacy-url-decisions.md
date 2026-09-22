# Решения по старым URL проектов

Таблица фиксирует только пути, подтверждённые репозиторием: идентификаторами
в `public/content/projects.ru.json`, правилами `public/_redirects` и инвентарём
`docs/seo/public-route-inventory.md`. Неизвестные пути семейства `/project/`
возвращают `404`; новые кейсы не получают старый URL автоматически.

| Старый путь | Решение | Цель | Основание |
| --- | --- | --- | --- |
| `/project/Media%20%26%20Entertainment/` | redirect | `/cases/noodome/` | Точный вариант из redirect fixture; канонический кейс Noodome |
| `/project/Media%20&%20Entertainment/` | redirect | `/cases/noodome/` | Точный вариант из redirect fixture; канонический кейс Noodome |
| `/project/media-entertainment/` | redirect | `/cases/noodome/` | Legacy slug кейса Noodome |
| `/project/web-site/` | redirect | `/cases/alliance-stroy-garant/` | Legacy slug кейса АльянсСтройГарант |
| `/project/web-service/` | redirect | `/cases/sims-dynasty-tree/` | Legacy slug кейса Sims Dynasty Tree |
| `/project/harmonize-me/` | redirect | `/cases/harmonize-me/` | Опубликованный legacy-кейс |
| `/project/stroyrem/` | redirect | `/cases/stroyrem/` | Опубликованный legacy-кейс |
| `/project/wowbanner/` | redirect | `/cases/wowbanner/` | Опубликованный legacy-кейс |
| `/project/serviceplus/` | redirect | `/cases/serviceplus/` | Опубликованный legacy-кейс |
| `/project/amch/` | redirect | `/cases/amch/` | Опубликованный legacy-кейс |
| `/project/notion-analog/` | gone | — | Проект снят с публикации по решению владельца портфолио |

Все редиректы ведут сразу на канонический URL со слешем и сохраняют только
разрешённые параметры атрибуции. Снятый с публикации проект возвращает `410 Gone`.
