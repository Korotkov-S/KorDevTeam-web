import { getDb } from "../db/client";
import { createAdvertisingRepository } from "./repository";
import { createAdvertisingService } from "./service";

let service: ReturnType<typeof createAdvertisingService> | undefined;

export function getAdvertisingService() {
  service ??= createAdvertisingService(createAdvertisingRepository(getDb()));
  return service;
}
