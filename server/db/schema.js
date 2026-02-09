/**
 * SQLite schema + lightweight migrations (SQL.js compatible).
 *
 * db: SQL.js Database with .exec(sql) and .run(sql, params?)
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const res = db.exec(`SELECT value FROM _meta WHERE key = 'schema_version'`);
  const currentRaw = res?.[0]?.values?.[0]?.[0];
  const current = currentRaw ? Number(currentRaw) : 0;
  if (!Number.isFinite(current)) throw new Error("Invalid schema_version in _meta");

  let v = current;

  if (v < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        lang TEXT NOT NULL,
        title TEXT NOT NULL,
        content_md TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        date_text TEXT NOT NULL DEFAULT '',
        read_time_text TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        UNIQUE(slug, lang)
      );

      CREATE INDEX IF NOT EXISTS idx_posts_lang_updated ON posts(lang, updated_at_ms DESC);
    `);
    v = 1;
  }

  if (v < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT NOT NULL,
        lang TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        full_description_md TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        technologies_json TEXT NOT NULL DEFAULT '[]',
        features_json TEXT NOT NULL DEFAULT '[]',
        demo_url TEXT,
        github_url TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(project_id, lang)
      );

      CREATE INDEX IF NOT EXISTS idx_projects_lang_updated ON projects(lang, updated_at_ms DESC);
    `);
    v = 2;
  }

  if (v < 3) {
    // Blog cover image (public URL)
    // SQL.js supports ALTER TABLE ADD COLUMN.
    db.exec(`
      ALTER TABLE posts ADD COLUMN cover_url TEXT NOT NULL DEFAULT '';
    `);
    v = 3;
  }

  if (v !== current) {
    db.run(
      `INSERT INTO _meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [String(v)]
    );
  }
}

module.exports = { migrate };

