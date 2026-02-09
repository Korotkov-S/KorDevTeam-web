const fs = require("node:fs/promises");
const path = require("node:path");

const { migrate } = require("./schema");

// SQL.js (WASM) provides a full SQLite engine without native compilation.
// We persist the DB by exporting it to a file after writes.
const initSqlJsRaw = require("sql.js");
const initSqlJs =
  typeof initSqlJsRaw === "function" ? initSqlJsRaw : initSqlJsRaw.default;

function defaultDbPath() {
  return path.join(process.cwd(), "server", "data", "content.sqlite");
}

function getDbPath() {
  const p = process.env.SQLITE_PATH || defaultDbPath();
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function nowMs() {
  return Date.now();
}

function safeLang(x) {
  return x === "en" ? "en" : "ru";
}

function toJson(val, fallback = "[]") {
  try {
    return JSON.stringify(val ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

function fromJson(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

let _sqlPromise = null;
async function getSqlJs() {
  if (_sqlPromise) return _sqlPromise;
  _sqlPromise = initSqlJs({
    locateFile: (file) => {
      // file is usually "sql-wasm.wasm"
      return require.resolve(`sql.js/dist/${file}`);
    },
  });
  return _sqlPromise;
}

let _dbPromise = null;
let _writeChain = Promise.resolve();

async function loadDb() {
  const SQL = await getSqlJs();
  const dbPath = getDbPath();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    const raw = await fs.readFile(dbPath);
    const db = new SQL.Database(new Uint8Array(raw));
    migrate(db);
    return db;
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
    const db = new SQL.Database();
    migrate(db);
    return db;
  }
}

async function getDb() {
  if (!_dbPromise) _dbPromise = loadDb();
  return _dbPromise;
}

async function persistDb(db) {
  const dbPath = getDbPath();
  const data = db.export();
  await fs.writeFile(dbPath, Buffer.from(data));
}

function withWriteLock(fn) {
  _writeChain = _writeChain.then(fn, fn);
  return _writeChain;
}

async function queryGet(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    if (stmt.step()) return stmt.getAsObject();
    return null;
  } finally {
    stmt.free();
  }
}

async function queryAll(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

async function runWrite(sql, params = []) {
  const db = await getDb();
  db.run(sql, params);
  await persistDb(db);
}

async function runWriteBatch(fn) {
  return withWriteLock(async () => {
    const db = await getDb();
    fn(db);
    await persistDb(db);
  });
}

// -------------------------
// Posts
// -------------------------

async function getPost({ slug, lang }) {
  const row = await queryGet(
    `SELECT slug, lang, title, content_md, excerpt, tags_json, date_text, read_time_text, created_at_ms, updated_at_ms
     FROM posts
     WHERE slug = ? AND lang = ?`,
    [String(slug), safeLang(lang)]
  );
  if (!row) return null;
  return {
    slug: row.slug,
    lang: row.lang,
    title: row.title,
    content: row.content_md,
    excerpt: row.excerpt,
    tags: fromJson(row.tags_json, []),
    date: row.date_text,
    readTime: row.read_time_text,
    createdAtMs: Number(row.created_at_ms || 0),
    updatedAtMs: Number(row.updated_at_ms || 0),
  };
}

async function upsertPost({
  slug,
  lang,
  title,
  content,
  excerpt,
  tags,
  date,
  readTime,
  createdAtMs,
  updatedAtMs,
}) {
  return withWriteLock(async () => {
    const l = safeLang(lang);
    const now = nowMs();
    const upd = Number.isFinite(updatedAtMs) ? Number(updatedAtMs) : now;

    const existing = await queryGet(
      `SELECT created_at_ms FROM posts WHERE slug = ? AND lang = ?`,
      [String(slug), l]
    );
    const createdAt =
      Number(existing?.created_at_ms) ||
      (Number.isFinite(createdAtMs) ? Number(createdAtMs) : now);

    const db = await getDb();
    db.run(
      `INSERT INTO posts (
          slug, lang, title, content_md, excerpt, tags_json, date_text, read_time_text, created_at_ms, updated_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug, lang) DO UPDATE SET
          title = excluded.title,
          content_md = excluded.content_md,
          excerpt = excluded.excerpt,
          tags_json = excluded.tags_json,
          date_text = excluded.date_text,
          read_time_text = excluded.read_time_text,
          updated_at_ms = excluded.updated_at_ms`,
      [
        String(slug),
        l,
        String(title || ""),
        String(content || ""),
        String(excerpt || ""),
        toJson(Array.isArray(tags) ? tags : [], "[]"),
        String(date || ""),
        String(readTime || ""),
        Number(createdAt),
        Number(upd),
      ]
    );

    await persistDb(db);
    return await getPost({ slug, lang: l });
  });
}

async function deletePost({ slug, lang }) {
  return withWriteLock(async () => {
    const db = await getDb();
    db.run(`DELETE FROM posts WHERE slug = ? AND lang = ?`, [
      String(slug),
      safeLang(lang),
    ]);
    const changes = await queryGet(`SELECT changes() AS c`);
    await persistDb(db);
    return Number(changes?.c || 0) > 0;
  });
}

async function listPostMetas({ lang }) {
  const l = safeLang(lang);
  const rows = await queryAll(
    `SELECT slug, lang, title, excerpt, tags_json, date_text, read_time_text, updated_at_ms
     FROM posts
     WHERE lang = ?
     ORDER BY updated_at_ms DESC`,
    [l]
  );
  return rows.map((r) => ({
    slug: r.slug,
    lang: r.lang,
    title: r.title,
    excerpt: r.excerpt,
    date: r.date_text,
    readTime: r.read_time_text,
    tags: fromJson(r.tags_json, []),
    mtimeMs: Number(r.updated_at_ms || 0),
  }));
}

// -------------------------
// Projects
// -------------------------

async function getProjects({ lang }) {
  const l = safeLang(lang);
  const rows = await queryAll(
    `SELECT project_id, lang, title, description, full_description_md, image_url, technologies_json, features_json, demo_url, github_url, updated_at_ms
     FROM projects
     WHERE lang = ?
     ORDER BY updated_at_ms DESC`,
    [l]
  );
  return rows.map((r) => ({
    id: r.project_id,
    title: r.title,
    description: r.description,
    fullDescription: r.full_description_md,
    image: r.image_url,
    technologies: fromJson(r.technologies_json, []),
    features: fromJson(r.features_json, []),
    demoUrl: r.demo_url || "",
    githubUrl: r.github_url || "",
    updatedAtMs: Number(r.updated_at_ms || 0),
  }));
}

async function replaceProjects({ lang, projects }) {
  const l = safeLang(lang);
  const now = nowMs();
  const list = Array.isArray(projects) ? projects : [];

  await runWriteBatch((db) => {
    db.run(`DELETE FROM projects WHERE lang = ?`, [l]);
    for (const p of list) {
      const id = String(p?.id || "").trim();
      if (!id) continue;
      db.run(
        `INSERT INTO projects (
            project_id, lang, title, description, full_description_md, image_url,
            technologies_json, features_json, demo_url, github_url, created_at_ms, updated_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          l,
          String(p?.title || id),
          String(p?.description || ""),
          String(p?.fullDescription || ""),
          String(p?.image || ""),
          toJson(Array.isArray(p?.technologies) ? p.technologies : [], "[]"),
          toJson(Array.isArray(p?.features) ? p.features : [], "[]"),
          p?.demoUrl ? String(p.demoUrl) : "",
          p?.githubUrl ? String(p.githubUrl) : "",
          now,
          now,
        ]
      );
    }
  });

  return await getProjects({ lang: l });
}

module.exports = {
  getDb,
  safeLang,
  nowMs,
  // posts
  getPost,
  upsertPost,
  deletePost,
  listPostMetas,
  // projects
  getProjects,
  replaceProjects,
};

