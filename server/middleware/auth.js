/**
 * Middleware для аутентификации через API ключ
 * Проверяет наличие и валидность API ключа в заголовке Authorization
 */

const authenticate = (req, res, next) => {
  const apiKey = process.env.API_KEY;
  const adminUser = process.env.ADMIN_USER || "adminKor";
  const adminPassword = process.env.ADMIN_PASSWORD || "adminKor";

  // Получаем API ключ из заголовка Authorization
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).json({ 
      error: 'Authorization header is required' 
    });
  }

  // Поддерживаем формат "Bearer <token>" или просто "<token>"
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (apiKey && token === apiKey) return next();
    return res.status(403).json({ error: "Invalid API key" });
  }

  // Basic auth: "Basic base64(user:pass)"
  if (authHeader.startsWith("Basic ")) {
    const b64 = authHeader.slice(6);
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const [user, pass] = decoded.split(":");
      if (user === adminUser && pass === adminPassword) return next();
      res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
      return res.status(403).json({ error: "Invalid credentials" });
    } catch {
      res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
      return res.status(401).json({ error: "Invalid Authorization header" });
    }
  }

  // Backward compatibility: if API_KEY is set and header is a raw token
  if (apiKey && authHeader === apiKey) return next();

  res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
  return res.status(401).json({ error: "Unsupported Authorization method" });

};

module.exports = { authenticate };
