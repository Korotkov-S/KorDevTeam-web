/**
 * Пример использования API для создания постов
 * 
 * Использование:
 * node server/example-client.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'your-secret-api-key-here';

async function createPost() {
  try {
    const response = await fetch(`${API_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Пример поста через API',
        content: `# Пример поста через API

Это пример поста, созданного через API.

## Заголовок раздела

Текст статьи в формате Markdown.

- Пункт списка 1
- Пункт списка 2
- Пункт списка 3

\`\`\`javascript
console.log('Пример кода');
\`\`\`
`,
        excerpt: 'Это пример поста, созданного через API для демонстрации функциональности.',
        tags: ['api', 'пример', 'тест'],
        date: new Date().toLocaleDateString('ru-RU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        readTime: '3 мин'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Пост успешно создан:');
    console.log(JSON.stringify(data, null, 2));
    
    return data.post;
  } catch (error) {
    console.error('❌ Ошибка при создании поста:', error.message);
    throw error;
  }
}

async function getAllPosts() {
  try {
    const response = await fetch(`${API_URL}/api/posts`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📝 Список всех постов:');
    console.log(JSON.stringify(data, null, 2));
    
    return data.posts;
  } catch (error) {
    console.error('❌ Ошибка при получении постов:', error.message);
    throw error;
  }
}

async function getPost(slug) {
  try {
    const response = await fetch(`${API_URL}/api/posts/${slug}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`📄 Пост "${slug}":`);
    console.log(JSON.stringify(data, null, 2));
    
    return data.post;
  } catch (error) {
    console.error('❌ Ошибка при получении поста:', error.message);
    throw error;
  }
}

// Запуск примера
if (require.main === module) {
  (async () => {
    console.log('🚀 Тестирование API для постов\n');
    
    try {
      // Создание поста
      const newPost = await createPost();
      console.log('\n');
      
      // Получение всех постов
      await getAllPosts();
      console.log('\n');
      
      // Получение конкретного поста
      if (newPost && newPost.slug) {
        await getPost(newPost.slug);
      }
    } catch (error) {
      console.error('\n💥 Критическая ошибка:', error);
      process.exit(1);
    }
  })();
}

module.exports = { createPost, getAllPosts, getPost };
