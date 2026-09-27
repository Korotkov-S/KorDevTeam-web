import { getDb } from "../db/client";
import { loadGeoPromptCatalog } from "./promptCatalog";
import { createGeoRepository } from "./repository";
import { createGeoMonitoringService } from "./service";

export function getGeoMonitoringService() {
  return createGeoMonitoringService(createGeoRepository(getDb()));
}

export function syncGeoPromptCatalog() {
  return getGeoMonitoringService().syncPromptCatalog(loadGeoPromptCatalog());
}
