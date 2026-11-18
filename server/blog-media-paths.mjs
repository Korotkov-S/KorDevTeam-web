const routePrefix = "/api/blog-media/";
const videoKey = /^blog\/telegram\/[1-9]\d{0,15}\/[a-f0-9]{64}\.mp4$/u;
const coverKey = /^media\/v1\/([a-f0-9]{2})\/\1[a-f0-9]{62}\/original\.(?:jpg|png|webp)$/u;

export function mediaType(key) {
  if (videoKey.test(key)) return "video/mp4";
  if (!coverKey.test(key)) return null;
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "image/webp";
}

function parseHttpsUrl(value) {
  if (!value || !/^https:\/\//iu.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password || url.search || url.hash ? null : url;
  } catch {
    return null;
  }
}

export function mediaBase(value) {
  const base = parseHttpsUrl(value);
  if (base && !base.pathname.endsWith("/")) base.pathname += "/";
  return base;
}

export function blogMediaPath(value, baseValue = typeof process === "undefined" ? undefined : process.env.PUBLIC_MEDIA_BASE_URL) {
  const base = mediaBase(baseValue);
  const source = parseHttpsUrl(value);
  if (!source || !base || source.origin !== base.origin || !source.pathname.startsWith(base.pathname)) return null;
  const key = source.pathname.slice(base.pathname.length);
  return mediaType(key) ? routePrefix + key : null;
}
