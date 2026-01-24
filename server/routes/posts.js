const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { 
  createPost, 
  getPost, 
  getAllPosts, 
  updatePost, 
  deletePost,
  generateSlug 
} = require('../utils/fileHandler');

/**
 * POST /api/posts
 * Создание нового поста
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { slug: slugOverride, title, content, excerpt, tags, date, readTime, lang = 'ru' } = req.body;

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

    // Создание поста
    const post = await createPost({
      slug,
      title,
      content,
      excerpt: excerpt || content.substring(0, 200) + '...',
      tags: tags || [],
      date: date || new Date().toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      readTime: readTime || '5 мин',
      lang
    });

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
    const posts = await getAllPosts();
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
    
    const post = await getPost(slug, lang);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
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
    const { title, content, excerpt, tags, date, readTime, lang = 'ru' } = req.body;

    const updatedPost = await updatePost(slug, {
      title,
      content,
      excerpt,
      tags,
      date,
      readTime,
      lang
    });

    if (!updatedPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

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

    const deleted = await deletePost(slug, lang);

    if (!deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
