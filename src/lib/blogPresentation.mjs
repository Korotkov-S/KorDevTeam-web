const MONTHS_RU = Object.freeze({
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
});

const MONTHS_EN = Object.freeze({
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
});

function toUtcTimestamp(year, month, day) {
  const timestamp = Date.UTC(year, month, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

export function parseBlogDate(value) {
  const date = String(value || "").trim();
  if (!date) return null;

  const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return toUtcTimestamp(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
  }

  const ruMatch = date.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/i);
  if (ruMatch) {
    const month = MONTHS_RU[ruMatch[2].toLowerCase()];
    if (month !== undefined) {
      return toUtcTimestamp(Number(ruMatch[3]), month, Number(ruMatch[1]));
    }
  }

  const enMatch = date.match(/^([a-z]+)\s+(\d{1,2}),\s+(\d{4})$/i);
  if (enMatch) {
    const month = MONTHS_EN[enMatch[1].toLowerCase()];
    if (month !== undefined) {
      return toUtcTimestamp(Number(enMatch[3]), month, Number(enMatch[2]));
    }
  }

  return null;
}

export function sortBlogPostsByDate(posts) {
  return posts
    .map((post, index) => ({ post, index }))
    .sort((left, right) => {
      const leftDate = parseBlogDate(left.post.date) ?? Number.NEGATIVE_INFINITY;
      const rightDate = parseBlogDate(right.post.date) ?? Number.NEGATIVE_INFINITY;
      return rightDate - leftDate || left.index - right.index;
    })
    .map(({ post }) => post);
}

export function normalizeBlogPage(value, totalPages) {
  const lastPage = Math.max(1, Math.trunc(Number(totalPages) || 1));
  const raw = String(value || "").trim();
  if (!/^\d+$/.test(raw)) return 1;
  return Math.min(lastPage, Math.max(1, Number(raw)));
}

export function getBlogPageHref(page) {
  const normalizedPage = Math.max(1, Math.trunc(Number(page) || 1));
  return normalizedPage === 1 ? "/blog/" : `/blog/?page=${normalizedPage}`;
}

export function buildPaginationItems(currentPage, totalPages) {
  const lastPage = Math.max(1, Math.trunc(Number(totalPages) || 1));
  const page = normalizeBlogPage(currentPage, lastPage);

  if (lastPage <= 7) {
    return Array.from({ length: lastPage }, (_, index) => index + 1);
  }
  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", lastPage];
  }
  if (page >= lastPage - 3) {
    return [
      1,
      "ellipsis-start",
      lastPage - 4,
      lastPage - 3,
      lastPage - 2,
      lastPage - 1,
      lastPage,
    ];
  }
  return [
    1,
    "ellipsis-start",
    page - 1,
    page,
    page + 1,
    "ellipsis-end",
    lastPage,
  ];
}

export function resolvePrerenderMeta(data, fallback) {
  return {
    ...fallback,
    title: data.title || data.seoTitle || fallback.title,
    seoTitle: data.seoTitle || fallback.seoTitle,
    excerpt: data.description || fallback.excerpt,
  };
}
