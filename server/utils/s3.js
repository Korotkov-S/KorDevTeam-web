const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

function getCredentialsFromEnv() {
  // Prefer standard AWS env vars (supported by SDK automatically),
  // but allow explicit S3_* vars for convenience.
  const accessKeyId =
    (process.env.S3_ACCESS_KEY || "").trim() ||
    (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey =
    (process.env.S3_SECRET_KEY || "").trim() ||
    (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const sessionToken = (process.env.AWS_SESSION_TOKEN || "").trim();

  if (accessKeyId && secretAccessKey) {
    return {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }
  // Let SDK fall back to its default provider chain (IAM role, etc.)
  return null;
}

function getS3Config() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT || ""; // for S3-compatible (e.g. MinIO)
  const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || "").trim() === "1";
  const publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL || "").trim(); // recommended
  // If you provide S3_PUBLIC_BASE_URL, you likely expect the uploaded objects to be readable by browsers.
  // Most S3-compatible providers default to private objects unless ACL/bucket policy says otherwise.
  // You can override this explicitly with S3_ACL (or set it empty to rely on bucket policy).
  const aclFromEnv = (process.env.S3_ACL || "").trim(); // e.g. public-read (optional)
  const acl = aclFromEnv || (publicBaseUrl ? "public-read" : "");

  return { bucket, region, endpoint, forcePathStyle, publicBaseUrl, acl };
}

function isS3Enabled() {
  const { bucket } = getS3Config();
  // Credentials can come from env or IAM role; we only hard-require bucket.
  return Boolean(bucket);
}

/** Возвращает статус S3 и причину, если отключён (для логов и API). */
function getS3Status() {
  const config = getS3Config();
  if (config.bucket && config.bucket.trim()) {
    return { enabled: true, reason: null };
  }
  return {
    enabled: false,
    reason: "S3_BUCKET не задан. Задайте переменную окружения S3_BUCKET (имя бакета).",
  };
}

function makeClient() {
  const { region, endpoint, forcePathStyle } = getS3Config();
  const cfg = { region };
  if (endpoint) cfg.endpoint = endpoint;
  if (forcePathStyle) cfg.forcePathStyle = true;
  const credentials = getCredentialsFromEnv();
  if (credentials) cfg.credentials = credentials;
  return new S3Client(cfg);
}

function encodeKeyForUrl(key) {
  // Encode each path segment but keep slashes.
  return String(key || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function buildPublicUrl({ bucket, region, endpoint, forcePathStyle, publicBaseUrl, key }) {
  const cleanKey = String(key || "").replace(/^\/+/, "");
  const encodedKey = encodeKeyForUrl(cleanKey);
  if (publicBaseUrl) return `${publicBaseUrl.replace(/\/+$/, "")}/${encodedKey}`;

  // Fallbacks (best effort). Prefer setting S3_PUBLIC_BASE_URL explicitly.
  if (endpoint) {
    const base = endpoint.replace(/\/+$/, "");
    if (forcePathStyle) return `${base}/${bucket}/${encodedKey}`;
    return `${base}/${encodedKey}`;
  }
  // AWS virtual-hosted style
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

async function uploadBufferToS3({ key, buffer, contentType, cacheControl }) {
  const { bucket, region, endpoint, forcePathStyle, publicBaseUrl, acl } = getS3Config();
  if (!bucket) throw new Error("S3_BUCKET is required");

  const client = makeClient();
  const cleanKey = String(key || "").replace(/^\/+/, "");

  const putParams = {
    Bucket: bucket,
    Key: cleanKey,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
    CacheControl: cacheControl || "public, max-age=31536000, immutable",
    ...(acl ? { ACL: acl } : {}),
  };

  try {
    await client.send(new PutObjectCommand(putParams));
  } catch (err) {
    // Some AWS accounts/buckets have ACLs disabled (Object Ownership "Bucket owner enforced"),
    // or some providers reject ACL parameter. In this case, retry without ACL.
    const msg = String(err?.message || "");
    const code = err?.name || err?.Code || err?.code;
    const looksLikeAclUnsupported =
      Boolean(acl) &&
      (code === "AccessControlListNotSupported" ||
        /acl/i.test(msg) ||
        /AccessControlListNotSupported/i.test(msg) ||
        /The bucket does not allow ACLs/i.test(msg));

    if (looksLikeAclUnsupported) {
      console.warn("[s3] ACL rejected by bucket/provider; retrying without ACL");
      const { ACL, ...noAclParams } = putParams;
      await client.send(new PutObjectCommand(noAclParams));
    } else {
      throw err;
    }
  }

  const url = buildPublicUrl({
    bucket,
    region,
    endpoint,
    forcePathStyle,
    publicBaseUrl,
    key: cleanKey,
  });

  return { bucket, key: cleanKey, url };
}

async function deleteObjectFromS3({ key }) {
  const { bucket } = getS3Config();
  if (!bucket) throw new Error("S3_BUCKET is required");
  const client = makeClient();
  const cleanKey = String(key || "").replace(/^\/+/, "");
  if (!cleanKey) throw new Error("key is required");
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
    })
  );
  return { bucket, key: cleanKey };
}

async function getObjectFromS3({ key }) {
  const { bucket } = getS3Config();
  if (!bucket) throw new Error("S3_BUCKET is required");
  const client = makeClient();
  const cleanKey = String(key || "").replace(/^\/+/, "");
  if (!cleanKey) throw new Error("key is required");
  return await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
    })
  );
}

module.exports = {
  isS3Enabled,
  getS3Config,
  getS3Status,
  uploadBufferToS3,
  deleteObjectFromS3,
  getObjectFromS3,
  buildPublicUrl,
};

