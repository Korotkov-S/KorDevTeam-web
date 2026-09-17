import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export type PasswordRecord = { digest: string; salt: string };

const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const SALT_BYTES = 32;
const DIGEST_BYTES = 64;

function validPassword(password: string): boolean {
  const length = Array.from(password).length;
  return length >= 14 && length <= 256;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, DIGEST_BYTES, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function canonicalBase64(value: string, bytes: number): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength === bytes && decoded.toString("base64") === value ? decoded : null;
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  if (!validPassword(password)) throw new Error("admin_password_invalid");
  const salt = randomBytes(SALT_BYTES);
  const digest = await derive(password, salt);
  return { digest: digest.toString("base64"), salt: salt.toString("base64") };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  if (!validPassword(password)) return false;
  const salt = canonicalBase64(record.salt, SALT_BYTES);
  const expected = canonicalBase64(record.digest, DIGEST_BYTES);
  if (!salt || !expected) return false;
  try {
    return timingSafeEqual(await derive(password, salt), expected);
  } catch {
    return false;
  }
}
