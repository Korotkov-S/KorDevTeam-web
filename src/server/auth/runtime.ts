import { getDb } from "../db/client";
import { readAdminAuthConfig } from "./config";
import { createAuthService, type AdminAuthService } from "./service";

let service: AdminAuthService | undefined;

export function getAdminAuthService(): AdminAuthService {
  return service ??= createAuthService(getDb(), readAdminAuthConfig(process.env));
}
