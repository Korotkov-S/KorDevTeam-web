# Read-only синхронизация кабинета VK Ads

**Дата:** 2026-09-28

**Статус:** архитектура согласована в диалоге; письменная спецификация ожидает проверки владельцем

## 1. Результат

Добавить к существующей базе рекламных знаний безопасное локальное зеркало всего
доступного кабинета VK Ads. Первый запуск импортирует всю доступную историю,
после чего отдельная системная задача обновляет зеркало ежедневно в 03:30 по
московскому времени.

Синхронизация читает аккаунт, кампании, группы, объявления, тексты, креативы,
статусы и дневную статистику. Она не создаёт, не редактирует, не запускает и не
останавливает рекламу. Агент и админка читают только локальное зеркало и не
обращаются в VK непосредственно.

История кабинета хранится отдельно от контролируемых рекламных экспериментов.
Старая кампания не становится экспериментом задним числом. Если объявление
относится к эксперименту KorDevTeam, связь создаётся отдельно по безопасным
VK-ID.

## 2. Согласованные решения

- Импортируется весь кабинет, доступный токену прямого рекламодателя.
- После полного backfill выполняется ежедневная синхронизация.
- Ежедневный запуск повторно читает последние семь календарных дней, потому что
  статистика платформы может уточняться задним числом.
- Изображения креативов сохраняются в закрытом объектном хранилище. Видео не
  скачиваются: сохраняются только безопасные метаданные и исходная HTTPS-ссылка.
- MCP не запускает синхронизацию и не ходит в VK; он читает сохранённые данные.
- Админка остаётся read-only и не получает элементов управления VK.
- Ранее опубликованный в переписке client secret считается скомпрометированным
  и не используется. Подключение допускается только после выпуска нового
  секрета.
- Сырые ответы VK, заголовки авторизации, access token, refresh token и client
  secret не сохраняются в журналах, предметных таблицах или read DTO.

## 3. Официальный контракт VK

Реализация опирается на актуальную официальную документацию:

- [получение доступа к API](https://ads.vk.ru/help/features/help_api);
- [авторизация OAuth2](https://ads.vk.ru/doc/api/info/%D0%90%D0%B2%D1%82%D0%BE%D1%80%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F%20%D0%B2%20API);
- [описание ресурсов](https://ads.vk.ru/doc/api).

Для прямого рекламодателя используется Client Credentials Grant. Ответ содержит
`access_token`, `refresh_token` и срок жизни; каждый API-запрос подписывается
`Authorization: Bearer`. Токен одного аккаунта не даёт доступ к данным другого
аккаунта. Обновление access token инвалидирует предыдущее значение, поэтому
refresh выполняется строго одним процессом под блокировкой.

Разрешённый сетевой контур рекламных данных состоит только из GET-запросов:

- `/api/v2/ad_plans.json` — кампании;
- `/api/v2/ad_groups.json` — группы объявлений;
- `/api/v2/banners.json` — объявления, тексты и ссылки на content;
- `/api/v2/statistics/{ad_plans|ad_groups|banners}/day.json` — дневная
  статистика.

Token endpoint `/api/v2/oauth2/token.json` — единственное разрешённое исключение
с POST. Оно используется только для OAuth2 Client Credentials и refresh token,
никогда не для рекламного объекта. Клиент не предоставляет универсальный метод
вызова произвольного пути.

## 4. Границы этапа

### Входит

- строгая конфигурация и безопасная сводка готовности;
- зашифрованное хранение состояния OAuth-токена;
- один сериализованный token manager;
- типизированный read-only VK provider;
- полный возобновляемый backfill;
- ежедневная инкрементальная синхронизация;
- нормализованное зеркало аккаунта, кампаний, групп, объявлений и метрик;
- версионирование текстов и креативов;
- закрытое хранение изображений;
- безопасная выдача изображения через авторизованный MCP/админский контур;
- read-only MCP-инструменты и раздел админки;
- CLI, Docker job, systemd service/timer, runbook и backup coverage;
- тестовый локальный VK-сервер, не использующий реальные секреты.

### Не входит

- POST/PATCH/DELETE рекламных кампаний, групп или объявлений;
- изменение статуса, бюджета, ставки, расписания, аудитории или креатива;
- импорт лидов или контактов;
- CRM-интеграция;
- hourly-мониторинг активного эксперимента;
- автоматические выводы, остановки или запуск следующей гипотезы;
- скачивание и хранение видеофайлов;
- агентский запуск backfill/daily через MCP;
- хранение сырых ответов поставщика.

## 5. Архитектура

### 5.1. Конфигурация

`src/server/advertising/vk/config.ts` читает:

- `VK_ADS_SYNC_ENABLED` — `true` или `false`, по умолчанию `false`;
- `VK_ADS_CLIENT_ID` — непустой идентификатор OAuth-клиента;
- `VK_ADS_CLIENT_SECRET` — новый client secret;
- `VK_ADS_TOKEN_ENCRYPTION_KEY_B64` — ровно 32 случайных байта в base64;
- настройки существующего приватного объектного хранилища.

Production origin зафиксирован в коде как `https://ads.vk.ru`, а daily lookback
как семь дней. Их нельзя изменить через production env. Fake origin и часы
передаются только как явные зависимости фабрик в тестах.

Если синхронизация включена, отсутствие или неправильный формат любого секрета
останавливает job до сетевого запроса. Safe summary показывает только
`enabled`, client ID fingerprint, origin, lookback и готовность хранилища.

### 5.2. OAuth token manager

`vkAdsTokenManager` — единственный компонент, которому доступны client secret и
зашифрованные токены.

- Access/refresh token вместе образуют один версионированный JSON envelope,
  который шифруется AES-256-GCM с новым случайным nonce при каждой ротации.
- В PostgreSQL сохраняются ciphertext envelope, nonce, auth tag, срок действия,
  версия и время обновления. Открытый токен не записывается.
- Ключ шифрования остаётся в `/etc/kordevteam/operations.env` и не попадает в
  базу или backup.
- Получение/refresh защищены PostgreSQL advisory lock и optimistic version.
- За пять минут до истечения token manager обновляет access token.
- При `expired_token` provider разрешает ровно один refresh и один повтор.
- `invalid_token`, `invalid_client`, `revoked_token` и ошибка расшифрования
  переводят запуск в терминальную безопасную ошибку без повторов.
- При успешной ротации предыдущий ciphertext заменяется атомарно.

Зашифрованный token state входит в backup. Без внешнего encryption key backup
не раскрывает токен и не может самостоятельно обращаться к VK.

### 5.3. Read-only VK provider

`vkAdsProvider` экспортирует только предметные методы:

- `checkAccount()`;
- `listCampaigns(page)`;
- `listAdGroups(page, changedSince?)`;
- `listAds(page, changedSince?)`;
- `getDailyStatistics(kind, ids, dateFrom, dateTo)`;
- `downloadCreativeImage(source)`.

Рекламные методы используют только GET. URL строится из константного origin,
константного path и типизированных query-параметров. Передать произвольный URL,
method или body через публичный интерфейс нельзя.

Загрузка изображения — отдельный GET-контур downloader к HTTPS URL, уже
полученному из валидированного объявления. Он не использует Bearer token и не
умеет вызывать рекламные API-ресурсы.

Пагинация использует документированные `limit`/`offset`, стабильную сортировку
по ID и ограниченный размер страницы. ID для статистики передаются пакетами.
Provider проверяет HTTP status, content type, верхнюю границу тела и Zod-схему.
Неизвестные поля игнорируются, а известные поля с неверным типом завершают
текущую порцию кодом `ads_vk_contract_invalid`.

На `429`, сетевой сбой и временный `5xx` выполняется не более четырёх попыток с
exponential backoff, jitter и учётом `Retry-After`. Остальные `4xx` не
повторяются. Текст ответа поставщика не включается в исключение или журнал.

### 5.4. Загрузка изображений

URL изображения берётся только из уже валидированного объекта объявления VK.
Downloader:

- допускает только HTTPS;
- запрещает username/password, нестандартный порт и IP literal;
- разрешает только публичные IP после DNS resolution;
- повторно проверяет каждый redirect;
- принимает JPEG, PNG или WebP после проверки magic bytes;
- ограничивает тело 20 MiB;
- вычисляет SHA-256 и дедуплицирует объект;
- сохраняет объект с private ACL, безопасным cache policy и случайным ключом в
  отдельном prefix `ads/vk/creatives/`.

Исходный filename не используется как ключ. Стабильный публичный URL не
создаётся. Админка получает изображение через авторизованный proxy route, а MCP
возвращает image content только токену с `ads:read`. Видео остаётся внешней
метаданной записью и не проксируется как доверенный файл.

### 5.5. Collector

Collector имеет три режима.

`check` проверяет конфигурацию, OAuth, доступ к аккаунту и объектному хранилищу,
не меняя рекламные таблицы.

`backfill`:

1. создаёт sync run и получает глобальную advisory lock;
2. загружает все страницы кампаний, групп и объявлений, включая blocked/deleted;
3. нормализует и upsert-ит объекты и версии;
4. сохраняет новые изображения;
5. определяет минимальную доступную дату статистики и читает дневные данные
   ограниченными календарными окнами;
6. после каждой завершённой страницы/даты атомарно обновляет checkpoint;
7. завершает run как `succeeded`, `partial` или `failed`.

Повтор `backfill` продолжает незавершённый run с checkpoint. Upsert и уникальные
ключи не допускают дублей.

`daily`:

1. получает ту же глобальную lock;
2. перечитывает все кампании во всех доступных статусах, а группы и объявления
   — по source update time с перекрытием и явными status-фильтрами;
3. повторно синхронизирует последние семь календарных дней статистики;
4. обновляет status/deleted markers, но физически не удаляет историю. Отсутствие
   объекта в инкрементальной странице само по себе не помечает его удалённым;
5. создаёт отдельный sync run с полными безопасными счётчиками.

Если lock занята, второй процесс завершается кодом `ads_vk_sync_locked` без
сетевых запросов. Частичная ошибка не откатывает уже завершённые страницы и не
изменяет существующие эксперименты.

## 6. Модель данных

Новая миграция создаёт отдельный bounded context.

### `ad_vk_oauth_states`

- один row на VK account/client fingerprint;
- encrypted access token, encrypted refresh token, nonce/tag;
- `expires_at`, `version`, `refreshed_at`;
- без plaintext secret/token и без raw response.

### `ad_vk_sync_runs`

- UUID, mode `check|backfill|daily`;
- status `running|succeeded|partial|failed`;
- started/finished timestamps;
- covered date range;
- типизированный checkpoint: entity, offset, date window;
- counters по прочитанным/созданным/обновлённым/пропущенным объектам;
- безопасный error code и request correlation ID.

### `ad_vk_accounts`

- внешний account ID, тип, валюта, timezone;
- безопасное display name без email/телефона;
- first/last seen, source updated time, inactive marker.

### `ad_vk_campaigns`

- внешний campaign ID и account ID;
- name, status, objective/type;
- безопасные budget/schedule metadata, когда доступны;
- created/updated/first seen/last seen/inactive timestamps;
- fingerprint нормализованной версии.

### `ad_vk_ad_groups`

- внешний group ID и campaign ID;
- name, status, package/optimization/bid strategy summaries;
- только безопасные aggregate targeting labels, без пользовательских списков;
- source timestamps, seen markers и fingerprint.

### `ad_vk_ads`

- внешний banner ID, group ID и campaign ID;
- name, status, moderation status и безопасный reason code;
- landing origin/path без query secrets;
- source timestamps, seen markers и fingerprint.

### `ad_vk_creative_versions`

- ad ID, version fingerprint, active interval;
- нормализованные text blocks и CTA;
- format, dimensions, duration и VK content IDs;
- private image asset ID либо video metadata/source URL;
- public advertiser creative content допустим, но lead PII и OAuth secrets
  запрещены. Текстовые DTO редактируют случайно обнаруженные email/телефон.

### `ad_vk_daily_metrics`

- object kind `campaign|ad_group|ad` и внешний ID;
- календарный день и timezone;
- spend, impressions, reach, clicks и доступные conversion counters;
- unique `(object_kind, external_id, metric_date)`;
- source revision/fingerprint и collected timestamp.

### `ad_vk_experiment_links`

- experiment ID, variant ID и тип/ID объекта VK;
- created timestamp и actor;
- связь не изменяет исторический объект и не создаётся автоматически по имени.

Все новые таблицы добавляются в backup required-table validation. Restore без
любой из таблиц зеркала считается неполным.

## 7. Read models, MCP и админка

`ads:read` получает локальные инструменты:

- `get_vk_ads_sync_status`;
- `list_vk_campaigns`;
- `list_vk_ad_groups`;
- `list_vk_ads`;
- `get_vk_ad`;
- `get_vk_ads_statistics`;
- `get_vk_creative_image`.

Списки имеют bounded limit и opaque keyset cursor. Они не возвращают OAuth,
сырой provider payload, targeting user lists, контакты или стабильные private
object URLs. `get_vk_creative_image` ограничивает размер и возвращает только
проверенное изображение из собственного хранилища.

Ни один из инструментов не инициирует network sync. `ads:write` не расширяет
VK read surface и не получает внешний контроль.

В `/admin/ads/vk/` отображаются:

- результат и время последнего запуска;
- покрытый диапазон истории и безопасные счётчики;
- кампании, группы, объявления и версии креативов;
- дневные/агрегированные расходы и метрики;
- приватные изображения через authenticated route;
- безопасные ошибки синхронизации.

Нет кнопок refresh, backfill, start, stop, budget, bid или edit. Ошибка базы или
хранилища показывает общий безопасный экран, а не внутреннее сообщение.

## 8. CLI и расписание

`server/vk-ads-collect.mjs` поддерживает:

```text
--mode=check
--mode=backfill
--mode=daily
```

Других режимов и произвольных API-путей нет. CLI возвращает ненулевой exit code
при `failed`, заблокированной конфигурации или терминальной OAuth-ошибке;
`partial` также считается неуспешным для systemd retry.

`scripts/run-vk-ads-collect.sh` запускает зафиксированный worker image через
Docker Compose без сборки на production host. `kordevteam-vk-ads-collect.timer`
запускает daily job ежедневно в `03:30 Europe/Moscow`, имеет `Persistent=true`
и небольшой randomized delay. Service использует operations env, `UMask=0077`,
`NoNewPrivileges=true`, network-online dependency и ограниченный restart.

Backfill запускается оператором той же service-командой с явным mode после
успешного `check`. Расписание никогда не запускает backfill автоматически.

## 9. Ошибки и наблюдаемость

Публичные/операторские коды ограничены:

- `ads_vk_disabled`;
- `ads_vk_config_invalid`;
- `ads_vk_oauth_invalid`;
- `ads_vk_token_expired`;
- `ads_vk_token_revoked`;
- `ads_vk_rate_limited`;
- `ads_vk_provider_unavailable`;
- `ads_vk_contract_invalid`;
- `ads_vk_storage_unavailable`;
- `ads_vk_sync_locked`;
- `ads_vk_sync_partial`;
- `ads_vk_unavailable`.

Run хранит этап, safe code, correlation ID и счётчики. HTTP body, authorization
header, URL query с секретами, stack trace и исходный exception в БД не
сохраняются. Серверный structured log редактирует известные secret/contact keys
до сериализации.

## 10. Тестирование

Реализация следует TDD и включает:

1. config-тесты fail-closed и safe summary;
2. crypto/token store тесты: AES-GCM, wrong key, atomic version и отсутствие
   plaintext в PostgreSQL;
3. provider tests на локальном HTTP-сервере: Bearer, pagination, schema bounds,
   `401`, single refresh, `429`, `Retry-After`, `5xx`, timeout и redaction;
4. allowlist-тест, доказывающий отсутствие POST/PATCH/PUT/DELETE к рекламным
   ресурсам и единственное OAuth POST-исключение;
5. downloader tests на MIME/magic bytes, size, redirect и SSRF;
6. repository integration tests на upsert, versions, deleted marker, daily
   metric uniqueness, checkpoint и lock;
7. collector tests на полный backfill, resume и seven-day daily overlap;
8. повторный backfill/daily без дублей;
9. MCP scope/DTO/image tests без token, contact и raw response leakage;
10. admin SSR tests без control surface;
11. deployment tests для Docker job, env example, systemd service/timer и
    runbook;
12. backup/restore tests для всех новых таблиц;
13. end-to-end с fake VK, PostgreSQL и fake private object store: весь кабинет
    импортируется дважды идемпотентно, MCP и админка видят одинаковую историю,
    а fake VK фиксирует ноль рекламных мутаций.

Ни один automated test не использует реальный client ID, client secret, token,
кабинет или CDN-объект VK.

## 11. Приёмка

Этап считается завершённым, когда одновременно выполнено следующее:

- новый secret не находится в Git, build output, логах и read DTO;
- `check` подтверждает доступ без записи предметных объектов;
- backfill импортирует все страницы доступного кабинета и возобновляется после
  искусственного сбоя;
- повторный backfill не создаёт дублей;
- daily обновляет объекты и ровно последние семь дней метрик;
- удалённые/архивные объекты остаются в истории;
- изображения закрыты и доступны только авторизованным читателям;
- MCP анализирует локальное зеркало без сетевого обращения к VK;
- админка не содержит управления рекламой;
- fake VK подтверждает только разрешённые GET и OAuth POST;
- migration check, typecheck, полный test suite, production build и diff check
  проходят;
- операторский runbook описывает выпуск нового секрета, `check`, backfill,
  daily, ротацию, восстановление и отключение.

## 12. Порядок релиза

1. Реализовать и проверить код без реального секрета на fake VK.
2. Развернуть миграцию и disabled-конфигурацию.
3. Выпустить новый client secret VK; старое опубликованное значение не
   использовать.
4. Сохранить client ID, secret и encryption key в operations secret env.
5. Выполнить `check` и проверить safe report.
6. Запустить один backfill и сверить количество объектов с кабинетом.
7. Проверить админку и MCP read tools.
8. Включить ежедневный timer.
9. Наблюдать первые три запуска; уведомлять только о partial/failed, отставании
   синхронизации или необходимости вмешательства.

После этого этапа система умеет надёжно читать фактическую историю VK. Создание
рекламы и CRM-атрибуция остаются отдельными будущими этапами с собственными
спецификациями и согласованиями.
