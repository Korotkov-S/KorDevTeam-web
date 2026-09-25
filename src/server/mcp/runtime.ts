import { readAdminAuthConfig } from "../auth/config";
import { getDb } from "../db/client";
import { createMcpTokenRepository, type McpTokenRepository } from "./tokenRepository";
import { createMcpTokenService, type McpTokenService } from "./tokenService";

let repository: McpTokenRepository | undefined;
let service: McpTokenService | undefined;

function getMcpTokenRepository(): McpTokenRepository {
  return repository ??= createMcpTokenRepository(getDb());
}

export function getMcpTokenService(): McpTokenService {
  return service ??= createMcpTokenService(
    getMcpTokenRepository(),
    readAdminAuthConfig(process.env).sessionHmacKey,
  );
}

export async function checkMcpReady(): Promise<void> {
  await getMcpTokenRepository().checkReady();
}
