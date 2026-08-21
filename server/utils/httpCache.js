function setPublicContentCache(res) {
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=300",
  );
}

module.exports = { setPublicContentCache };
