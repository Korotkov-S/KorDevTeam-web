const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getPost: getDbPost,
  upsertPost,
  deletePost: deleteDbPost,
  listPostMetas,
  safeLang,
} = require("../db");
const {
  getPost: getFilePost,
  saveMarkdownFile,
  deleteMarkdownFile,
  generateSlug,
} = require("../utils/fileHandler");
const { extractMetaFromMarkdown } = require("../utils/contentMeta");

/**
 * POST /api/posts
 * Создание нового поста
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { slug: slugOverride, title, content, excerpt, tags, date, readTime, coverUrl, lang = 'ru' } = req.body;

    // Валидация обязательных полей
    if (!title || !content) {
      return res.status(400).json({ 
        error: 'Title and content are required' 
      });
    }

    // Генерация slug из заголовка
    const slug = (slugOverride && typeof slugOverride === "string" && slugOverride.trim())
      ? generateSlug(slugOverride)
      : generateSlug(title);

    const l = safeLang(lang);
    const meta = await extractMetaFromMarkdown({
      slug,
      md: String(content || ""),
      lang: l,
      filePathForStat: undefined,
    });

    const post = await upsertPost({
      slug,
      lang: l,
      title: String(title),
      coverUrl:
        (typeof coverUrl === "string" && coverUrl.trim()) ? coverUrl.trim() : (meta.coverUrl || ""),
      content: String(content),
      excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : meta.excerpt,
      tags: Array.isArray(tags) ? tags : meta.tags,
      date: typeof date === "string" && date.trim() ? date.trim() : meta.date,
      readTime: typeof readTime === "string" && readTime.trim() ? readTime.trim() : meta.readTime,
      createdAtMs: meta.mtimeMs,
      updatedAtMs: meta.mtimeMs,
    });

    // Backward compatibility: still write markdown file for static builds.
    await saveMarkdownFile(slug, String(content), l);

    res.status(201).json({
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/posts
 * Получение списка всех постов
 */
router.get('/', async (req, res, next) => {
  try {
    // Keep endpoint for debugging: returns metas for both languages.
    const ru = await listPostMetas({ lang: "ru" });
    const en = await listPostMetas({ lang: "en" });
    const posts = { ru, en };
    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/posts/:slug
 * Получение конкретного поста по slug
 */
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { lang = 'ru' } = req.query;
    
    const l = safeLang(lang?.toString?.() || "ru");
    let post = await getDbPost({ slug, lang: l });

    // Legacy fallback: if missing in DB, try markdown file and import on the fly.
    if (!post) {
      const legacy = await getFilePost(slug, l);
      if (!legacy?.content) {
        return res.status(404).json({ error: "Post not found" });
      }
      const meta = await extractMetaFromMarkdown({
        slug,
        md: legacy.content,
        lang: l,
        filePathForStat: undefined,
      });
      post = await upsertPost({
        slug,
        lang: l,
        title: meta.title,
        coverUrl: meta.coverUrl || "",
        content: legacy.content,
        excerpt: meta.excerpt,
        tags: meta.tags,
        date: meta.date,
        readTime: meta.readTime,
        createdAtMs: meta.mtimeMs,
        updatedAtMs: meta.mtimeMs,
      });
    }

    res.json({ post });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/posts/:slug
 * Обновление поста
 */
router.put('/:slug', authenticate, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { title, content, excerpt, tags, date, readTime, coverUrl, lang = 'ru' } = req.body;

    const l = safeLang(lang);
    const existing = await getDbPost({ slug, lang: l });
    if (!existing) {
      // If DB doesn't have it, allow legacy file update (it will import too)
      const legacy = await getFilePost(slug, l);
      if (!legacy?.content) return res.status(404).json({ error: "Post not found" });
    }

    const nextContent = typeof content === "string" ? content : existing?.content || "";
    const meta = await extractMetaFromMarkdown({
      slug,
      md: String(nextContent),
      lang: l,
      filePathForStat: undefined,
    });

    const updatedPost = await upsertPost({
      slug,
      lang: l,
      title: typeof title === "string" && title.trim() ? title.trim() : meta.title,
      coverUrl:
        (typeof coverUrl === "string" && coverUrl.trim())
          ? coverUrl.trim()
          : (existing?.coverUrl || meta.coverUrl || ""),
      content: String(nextContent),
      excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : meta.excerpt,
      tags: Array.isArray(tags) ? tags : meta.tags,
      date: typeof date === "string" && date.trim() ? date.trim() : meta.date,
      readTime: typeof readTime === "string" && readTime.trim() ? readTime.trim() : meta.readTime,
      updatedAtMs: meta.mtimeMs,
    });

    // Backward compatibility: keep markdown file updated for static builds.
    await saveMarkdownFile(slug, String(nextContent), l);

    res.json({
      message: 'Post updated successfully',
      post: updatedPost
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/posts/:slug
 * Удаление поста
 */
router.delete('/:slug', authenticate, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { lang = 'ru' } = req.query;

    const l = safeLang(lang?.toString?.() || "ru");
    const deleted = await deleteDbPost({ slug, lang: l });
    // Legacy cleanup (ignore errors)
    await deleteMarkdownFile(slug, l);

    if (!deleted) return res.status(404).json({ error: "Post not found" });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
