# Решения по старым URL проектов

Таблица фиксирует только пути, подтверждённые репозиторием: идентификаторами
в `public/content/projects.ru.json`, правилами `public/_redirects` и инвентарём
`docs/seo/public-route-inventory.md`. Неизвестные пути семейства `/project/`
возвращают `404`; новые кейсы не получают старый URL автоматически.

| Старый путь | Решение | Цель | Основание |
| --- | --- | --- | --- |
| `/project/Media%20%26%20Entertainment/` | redirect | `/cases/media-entertainment/` | Точный вариант из redirect fixture |
| `/project/Media%20&%20Entertainment/` | redirect | `/cases/media-entertainment/` | Точный вариант из redirect fixture |
| `/project/media-entertainment/` | redirect | `/cases/media-entertainment/` | Опубликованный legacy-кейс и статический маршрут |
| `/project/web-site/` | redirect | `/cases/web-site/` | Опубликованный legacy-кейс и SSR fixture |
| `/project/web-service/` | redirect | `/cases/web-service/` | Опубликованный legacy-кейс |
| `/project/harmonize-me/` | redirect | `/cases/harmonize-me/` | Опубликованный legacy-кейс |
| `/project/stroyrem/` | redirect | `/cases/stroyrem/` | Опубликованный legacy-кейс |
| `/project/wowbanner/` | redirect | `/cases/wowbanner/` | Опубликованный legacy-кейс |
| `/project/serviceplus/` | redirect | `/cases/serviceplus/` | Опубликованный legacy-кейс |
| `/project/amch/` | redirect | `/cases/amch/` | Опубликованный legacy-кейс |
| `/project/notion-analog/` | redirect | `/cases/notion-analog/` | Опубликованный legacy-кейс |

Все редиректы ведут сразу на канонический URL со слешем и сохраняют только
разрешённые параметры атрибуции. На момент аудита подтверждённых путей для
решений `keep`, `noindex` или `gone` в репозитории нет.
