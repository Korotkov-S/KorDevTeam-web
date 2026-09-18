# Production deployment

Основной регламент blue/green-релизов, резервного копирования и восстановления находится в [operations/production-release.md](operations/production-release.md).

Для первого включения PostgreSQL-админки и публичной Timeweb S3-медиатеки используйте отдельный [runbook переключения админки и медиатеки](runbooks/admin-media-cutover.md). Он сохраняет ручной release gate: push в `main` только проверяет и публикует immutable image, но не переключает production.

Критические правила:

- не применять media migration до проверки и ручного переключения на media-совместимый образ;
- не передавать пароль администратора через argv;
- не выполнять destructive downgrade общей PostgreSQL;
- не использовать старые `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_TOKEN` и `S3_*` переменные: актуальные имена приведены в `deploy/env/operations.env.example`.
