import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent } from "./MarkdownContent";

test("renders a media UUID as a trusted CDN srcset and never leaks an unknown media scheme", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const media = {
    [id]: {
      id,
      src: "https://cdn.example/media/v1/hash/original.png",
      srcSet: "https://cdn.example/media/v1/hash/640.webp 640w, https://cdn.example/media/v1/hash/1280.webp 1280w",
      sizes: "(max-width: 768px) 100vw, 768px",
      alt: "Команда",
      decorative: false,
      width: 1280,
      height: 720,
    },
  };
  const host = globalThis as typeof globalThis & { React?: typeof React };
  const previous = host.React;
  host.React = React;
  let html: string;
  try {
    html = renderToStaticMarkup(<MarkdownContent markdown={`![Введённый alt](media:${id})\n\n![Нет](media:00000000-0000-4000-8000-000000000099)`} media={media} />);
  } finally {
    if (previous) host.React = previous;
    else delete host.React;
  }

  assert.match(html, /https:\/\/cdn\.example\/media\/v1\/hash\/original\.png/);
  assert.match(html, /640w/);
  assert.match(html, /alt="Команда"/);
  assert.doesNotMatch(html, /media:00000000/);
});

test("renders GFM tables inside their own horizontal scroll container", () => {
  const host = globalThis as typeof globalThis & { React?: typeof React };
  const previous = host.React;
  host.React = React;
  let html: string;
  try {
    html = renderToStaticMarkup(<MarkdownContent markdown={`| Шаг | Участник | Результат |
| --- | --- | --- |
| Получить заявку | Сайт | Заявка создана |`} />);
  } finally {
    if (previous) host.React = previous;
    else delete host.React;
  }

  assert.match(html, /overflow-x-auto/);
  assert.match(html, /<table[^>]*table-fixed/);
  assert.match(html, /<th[^>]*>Шаг<\/th>/);
  assert.match(html, /<td[^>]*break-words[^>]*>Получить заявку<\/td>/);
});
