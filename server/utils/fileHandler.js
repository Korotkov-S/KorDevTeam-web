const fs = require('fs').promises;
const path = require('path');

// Пути к директориям с постами
const PUBLIC_BLOG_DIR = path.join(__dirname, '../../public/blog');
const SRC_BLOG_DIR = path.join(__dirname, '../../src/blog');

/**
 * Генерация slug из заголовка
 */
function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Удаляем спецсимволы
    .replace(/[\s_-]+/g, '-') // Заменяем пробелы и подчеркивания на дефисы
    .replace(/^-+|-+$/g, ''); // Удаляем дефисы в начале и конце
}

/**
 * Создание директорий, если они не существуют
 */
async function ensureDirectories() {
  try {
    await fs.mkdir(PUBLIC_BLOG_DIR, { recursive: true });
    await fs.mkdir(SRC_BLOG_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
    throw error;
  }
}

/**
 * Сохранение markdown файла
 */
async function saveMarkdownFile(slug, content, lang = 'ru') {
  await ensureDirectories();
  
  const filename = lang === 'en' ? `${slug}.en.md` : `${slug}.md`;
  const publicPath = path.join(PUBLIC_BLOG_DIR, filename);
  const srcPath = path.join(SRC_BLOG_DIR, filename);

  // Сохраняем в обе директории
  await fs.writeFile(publicPath, content, 'utf-8');
  await fs.writeFile(srcPath, content, 'utf-8');

  return { publicPath, srcPath };
}

/**
 * Чтение markdown файла
 */
async function readMarkdownFile(slug, lang = 'ru') {
  const filename = lang === 'en' ? `${slug}.en.md` : `${slug}.md`;
  const filePath = path.join(PUBLIC_BLOG_DIR, filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Удаление markdown файла
 */
async function deleteMarkdownFile(slug, lang = 'ru') {
  const filename = lang === 'en' ? `${slug}.en.md` : `${slug}.md`;
  const publicPath = path.join(PUBLIC_BLOG_DIR, filename);
  const srcPath = path.join(SRC_BLOG_DIR, filename);

  try {
    await fs.unlink(publicPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  try {
    await fs.unlink(srcPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/**
 * Получение списка всех постов
 */
async function getAllPosts() {
  try {
    await ensureDirectories();
    const files = await fs.readdir(PUBLIC_BLOG_DIR);
    
    // Фильтруем только .md файлы и исключаем .en.md (чтобы не дублировать)
    const mdFiles = files.filter(file => 
      file.endsWith('.md') && !file.endsWith('.en.md')
    );

    const posts = [];
    
    for (const file of mdFiles) {
      const slug = file.replace('.md', '');
      try {
        const content = await readMarkdownFile(slug);
        if (content) {
          posts.push({
            slug,
            filename: file,
            size: content.length
          });
        }
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }

    return posts;
  } catch (error) {
    console.error('Error getting all posts:', error);
    throw error;
  }
}

/**
 * Создание нового поста
 */
async function createPost({ slug, title, content, excerpt, tags, date, readTime, lang = 'ru' }) {
  try {
    // Формируем содержимое markdown файла
    const markdownContent = content;

    // Сохраняем файл
    const { publicPath, srcPath } = await saveMarkdownFile(slug, markdownContent, lang);

    return {
      slug,
      title,
      excerpt,
      tags,
      date,
      readTime,
      lang,
      paths: {
        public: publicPath,
        src: srcPath
      }
    };
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
}

/**
 * Получение поста по slug
 */
async function getPost(slug, lang = 'ru') {
  try {
    const content = await readMarkdownFile(slug, lang);
    
    if (!content) {
      return null;
    }

    return {
      slug,
      content,
      lang
    };
  } catch (error) {
    console.error('Error getting post:', error);
    throw error;
  }
}

/**
 * Обновление поста
 */
async function updatePost(slug, { title, content, excerpt, tags, date, readTime, lang = 'ru' }) {
  try {
    // Проверяем, существует ли пост
    const existingPost = await getPost(slug, lang);
    if (!existingPost) {
      return null;
    }

    // Сохраняем обновленный контент
    const { publicPath, srcPath } = await saveMarkdownFile(slug, content, lang);

    return {
      slug,
      title,
      excerpt,
      tags,
      date,
      readTime,
      lang,
      paths: {
        public: publicPath,
        src: srcPath
      }
    };
  } catch (error) {
    console.error('Error updating post:', error);
    throw error;
  }
}

/**
 * Удаление поста
 */
async function deletePost(slug, lang = 'ru') {
  try {
    // Проверяем, существует ли пост
    const existingPost = await getPost(slug, lang);
    if (!existingPost) {
      return false;
    }

    await deleteMarkdownFile(slug, lang);
    return true;
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
}

module.exports = {
  generateSlug,
  createPost,
  getPost,
  getAllPosts,
  updatePost,
  deletePost,
  saveMarkdownFile,
  readMarkdownFile,
  deleteMarkdownFile
};
