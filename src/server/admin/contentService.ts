import { z } from "zod";

import { invalidateAllContentCaches } from "../content/service";
import { validateIdentity, validatePublication } from "../content/types";
import type { AdminContentDatabase } from "./contentRepository";
import { createAdminContentRepository } from "./contentRepository";
import { parseAdminContentCommand, type AdminContentCommand } from "./contentSchemas";

export function createAdminContentService(db: AdminContentDatabase, invalidate: () => void = invalidateAllContentCaches) {
  const repository = createAdminContentRepository(db);
  const changed = async <T>(operation: Promise<T>) => {
    const result = await operation;
    invalidate();
    return result;
  };
  return {
    list: repository.list,
    getEditorData(id: string) {
      validateIdentity(id);
      return repository.getEditorData(id);
    },
    save(input: unknown, actorId: string) {
      validateIdentity(actorId);
      return changed(repository.save(parseAdminContentCommand(input), actorId));
    },
    unpublish(id: string, expectedVersion: number, actorId: string) {
      validateIdentity(id, expectedVersion);
      validateIdentity(actorId);
      return changed(repository.unpublish(id, expectedVersion, actorId));
    },
    restore(id: string, revisionVersion: number, expectedVersion: number, actorId: string) {
      validateIdentity(id, expectedVersion);
      validateIdentity(id, revisionVersion);
      validateIdentity(actorId);
      return changed(repository.restore(id, revisionVersion, expectedVersion, actorId));
    },
    async hardDelete(id: string, expectedVersion: number) {
      validateIdentity(id, expectedVersion);
      const deleted = await repository.hardDelete(id, expectedVersion);
      if (deleted) invalidate();
      return deleted;
    },
    preview(input: unknown) {
      const command = parseAdminContentCommand(input);
      const entry = { ...command, status: command.intent === "publish" ? "published" : "draft" } as never;
      if (command.intent === "publish") validatePublication(entry);
      return { entry, relations: command.relations, mediaRefs: command.mediaRefs };
    },
    listSettings: repository.listSettings,
    saveSetting(key: string, value: Record<string, unknown>, expectedVersion: number) {
      if (!z.number().int().nonnegative().safeParse(expectedVersion).success) throw new Error("setting_validation_error");
      return repository.saveSetting(key, value, expectedVersion);
    },
  };
}

export type AdminContentService = ReturnType<typeof createAdminContentService>;
export type { AdminContentCommand };
