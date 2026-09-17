import { getDb } from "../db/client";
import { createAdminContentService, type AdminContentService } from "./contentService";

let service: AdminContentService | undefined;

export function getAdminContentService(): AdminContentService {
  return service ??= createAdminContentService(getDb());
}
