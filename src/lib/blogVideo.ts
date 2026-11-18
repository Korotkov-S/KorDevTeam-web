export type BlogVideo = { url: string; duration: string };

const marker = /^ {0,3}\[Видео,\s*(\d{1,3}:[0-5]\d)\]\(([^\s()<>]+)\)[ \t]*$/u;

function isVideoUrl(url: string) {
  if (url.includes("\\")) return false;
  if (!(/^\/(?!\/)/.test(url) || /^https:\/\//i.test(url))) return false;
  try {
    const parsed = new URL(url, "https://kordev.team");
    return !parsed.username && !parsed.password && /\.(mp4|webm)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

// Only an explicit standalone video block opts into the portrait layout.
export function extractBlogVideo(markdown: string): { video: BlogVideo | null; markdown: string } {
  const lines = markdown.split(/\r?\n/);
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
      continue;
    }
    if (fence || lines[i - 1]?.trim() || lines[i + 1]?.trim()) continue;
    const match = marker.exec(lines[i]);
    if (!match || !isVideoUrl(match[2])) continue;
    return {
      video: { url: match[2], duration: match[1] },
      markdown: [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n").trim(),
    };
  }
  return { video: null, markdown };
}
