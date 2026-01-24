const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const postsRouter = require('./routes/posts');
const krasotulyaCrmRouter = require("./routes/krasotulyaCrm");
const contentRouter = require("./routes/content");
const projectsRouter = require("./routes/projects");
const adminRouter = require("./routes/admin");
const path = require('path');

// Загружаем переменные окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Роуты
app.use('/api/posts', postsRouter);
app.use("/api/krasotulya-crm", krasotulyaCrmRouter);
app.use("/api/content", contentRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/admin", adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📝 Posts API available at http://localhost:${PORT}/api/posts`);
});

module.exports = app;
