import { getDb } from "../db/client";
import { readPublicMediaConfig } from "./config";
import { createMediaRepository } from "./repository";
import { createMediaService, type MediaService } from "./service";
import { createPublicMediaStore } from "./store";

let service: MediaService | undefined;

export function getMediaService(): MediaService {
  if (!service) {
    const config = readPublicMediaConfig(process.env);
    service = createMediaService(createMediaRepository(getDb()), createPublicMediaStore(config), config);
  }
  return service;
}
