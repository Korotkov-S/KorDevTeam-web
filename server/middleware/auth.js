/**
 * Middleware для аутентификации через API ключ
 * Проверяет наличие и валидность API ключа в заголовке Authorization
 */

const authenticate = (req, res, next) => {
  const apiKey = process.env.API_KEY;
  
  // Если API_KEY не установлен, пропускаем аутентификацию (для разработки)
  if (!apiKey) {
    console.warn('⚠️  API_KEY not set. Authentication disabled.');
    return next();
  }

  // Получаем API ключ из заголовка Authorization
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ 
      error: 'Authorization header is required' 
    });
  }

  // Поддерживаем формат "Bearer <token>" или просто "<token>"
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  if (token !== apiKey) {
    return res.status(403).json({ 
      error: 'Invalid API key' 
    });
  }

  next();
};

module.exports = { authenticate };
