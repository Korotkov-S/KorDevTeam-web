const express = require("express");

const router = express.Router();

const MAX_FIELD_LENGTH = 1200;

function normalizeField(value) {
  return String(value || "").trim().slice(0, MAX_FIELD_LENGTH);
}

function buildMessage(payload) {
  const name = normalizeField(payload.name);
  const contact = normalizeField(payload.contact || payload.email);
  const budget = normalizeField(payload.budget);
  const timeline = normalizeField(payload.timeline);
  const message = normalizeField(payload.message);
  const page = normalizeField(payload.page || payload.source);

  return [
    "Новая заявка с kordev.team",
    "",
    `Имя: ${name || "не указано"}`,
    `Контакт: ${contact || "не указан"}`,
    budget ? `Бюджет: ${budget}` : null,
    timeline ? `Срок: ${timeline}` : null,
    page ? `Страница: ${page}` : null,
    "",
    "Задача:",
    message || "не указана",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.CONTACT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CONTACT_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    const error = new Error("Contact delivery is not configured");
    error.status = 503;
    throw error;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    const error = new Error(`Telegram delivery failed: ${res.status} ${details}`.trim());
    error.status = 502;
    throw error;
  }
}

router.post("/", async (req, res, next) => {
  try {
    const name = normalizeField(req.body?.name);
    const contact = normalizeField(req.body?.contact || req.body?.email);
    const message = normalizeField(req.body?.message);

    if (!name || !contact || !message) {
      return res.status(400).json({
        error: "name, contact and message are required",
      });
    }

    await sendTelegramMessage(buildMessage(req.body || {}));

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
