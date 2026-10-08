# Page-control release evidence — 2026-10-08

Stage 1 commit e8e33e7b4889446b5965fadac4bcfd2d0a772502 passed CI [37746636662](https://github.com/Korotkov-S/KorDevTeam-web/actions/runs/37746636662) and protected production deployment [37748778996](https://github.com/Korotkov-S/KorDevTeam-web/actions/runs/37748778996).

Independent SSH checks verified active blue, healthy, matching recorded immutable web image/actual image ID/OCI revision, public readiness and slot header, and one-hop canonical redirects. Content plan and apply retained 145 records unchanged with zero inserts/updates/conflicts; verification had zero mismatches. The normal protected release recorded its encrypted pre-release backup and authorized marked test-lead gate.

Original Oct7/8 schemaVersion 2 reports imported 156 observations each. PostgreSQL has 312 immutable history rows; replaying Oct8 inserted zero and returned 156 unchanged. Latest Google: 54 indexed, two canonical conflicts, 22 not indexed. Yandex: 62 indexed, 16 unconfirmed. Registry: 48 articles, 23 cases, seven services; 109 active keys cover 78 targets. SchemaVersion 1 reports were not transformed.

Existing heartbeat now imports prepared daily audits idempotently and records report SHA/time only on success; schedule/target were read back unchanged. No public content, active core, paid budget/timer or additional search/API/indexing submissions changed. Production admin browser required login, which was not attempted: authenticated UI tests passed locally and in CI, while production verification checked actual backend/image/evidence, not an authenticated visual screen.
