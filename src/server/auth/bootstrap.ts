import { eq } from "drizzle-orm";

import type { createDb } from "../db/client";
import { adminUsers } from "../db/schema";
import { hashPassword } from "./password";

export type AdminDatabase = ReturnType<typeof createDb>;

export function normalizeAdminLogin(login: string): string {
  const normalized = login.trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,120}$/.test(normalized)) throw new Error("admin_login_invalid");
  return normalized;
}

export async function createAdminUser(
  db: AdminDatabase,
  input: { login: string; password: string },
): Promise<{ id: string; login: string }> {
  const login = normalizeAdminLogin(input.login);
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.login, login));
  if (existing) throw new Error("admin_login_exists");
  const password = await hashPassword(input.password);
  const [created] = await db.insert(adminUsers).values({
    login,
    passwordDigest: password.digest,
    passwordSalt: password.salt,
  }).returning({ id: adminUsers.id, login: adminUsers.login });
  return created;
}
