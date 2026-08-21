const fs = require("node:fs");
const path = require("node:path");

const ONE_YEAR_SECONDS = 31_536_000;

function appendVary(res, value) {
  const current = res.getHeader("Vary");
  const values = String(current || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value);
  }

  res.setHeader("Vary", values.join(", "));
}

function parseAcceptedEncodings(value) {
  return String(value || "")
    .split(",")
    .map((item) => {
      const [name, ...params] = item.trim().toLowerCase().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const quality = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { name, quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((item) => item.name && item.quality > 0);
}

function resolvePrecompressedAsset(assetRoot, requestPath, acceptEncoding) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(String(requestPath || ""));
  } catch {
    return null;
  }

  if (!decodedPath || decodedPath.includes("\0")) return null;

  const root = path.resolve(assetRoot);
  const originalPath = path.resolve(root, decodedPath.replace(/^\/+/, ""));
  if (originalPath !== root && !originalPath.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  const accepted = parseAcceptedEncodings(acceptEncoding);
  const candidates = [
    { name: "br", extension: ".br" },
    { name: "gzip", extension: ".gz" },
  ];

  for (const candidate of candidates) {
    if (!accepted.some((item) => item.name === candidate.name || item.name === "*")) {
      continue;
    }

    const compressedPath = `${originalPath}${candidate.extension}`;
    if (fs.existsSync(compressedPath)) {
      return {
        encoding: candidate.name,
        originalPath,
        compressedPath,
      };
    }
  }

  return null;
}

function setImmutableAssetHeaders(res) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
  );
}

function setPrecompressedAssetHeaders(res, encoding) {
  setImmutableAssetHeaders(res);
  res.setHeader("Content-Encoding", encoding);
  appendVary(res, "Accept-Encoding");
}

function setGeneralStaticHeaders(res, filePath) {
  if (path.extname(filePath).toLowerCase() === ".html") {
    res.setHeader("Cache-Control", "no-cache");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
}

module.exports = {
  ONE_YEAR_SECONDS,
  appendVary,
  parseAcceptedEncodings,
  resolvePrecompressedAsset,
  setGeneralStaticHeaders,
  setImmutableAssetHeaders,
  setPrecompressedAssetHeaders,
};
