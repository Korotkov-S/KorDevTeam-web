FROM node:22.22.0-alpine AS dependencies
WORKDIR /app
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM dependencies AS content-release-build
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
COPY . .
RUN test "${#RELEASE_SHA}" = 40 && printf '%s' "$RELEASE_SHA" | grep -Eq '^[a-f0-9]{40}$'
RUN yarn build:content-release

FROM dependencies AS media-migration
WORKDIR /app
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
LABEL org.opencontainers.image.revision=$RELEASE_SHA
COPY --chown=node:node tsconfig.json tsconfig.server.json package.json ./
COPY --chown=node:node src/server ./src/server
COPY --chown=node:node scripts/create-admin.ts scripts/migrate-media-to-s3.ts scripts/verify-media-migration.ts scripts/sweep-public-media.ts ./scripts/
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node public ./public
RUN test "${#RELEASE_SHA}" = 40 && printf '%s' "$RELEASE_SHA" | grep -Eq '^[a-f0-9]{40}$'
USER node
CMD ["node", "--import", "tsx", "scripts/migrate-media-to-s3.ts", "--dry-run", "--report", "/tmp/media-migration-report.json"]

FROM dependencies AS build
COPY . .
# Keep the sanitized migration database out of every production image layer.
RUN rm -f /app/server/data/content.sqlite
# CI supplies the exact commit; local Compose uses an explicit rehearsal value.
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
RUN test -n "$RELEASE_SHA" && yarn build

FROM dependencies AS production-dependencies
RUN yarn plugin import workspace-tools && yarn workspaces focus --all --production

FROM node:22.22.0-alpine AS content-release
WORKDIR /app
ENV NODE_ENV=production
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
LABEL org.opencontainers.image.revision=$RELEASE_SHA
LABEL org.opencontainers.image.source="https://github.com/Korotkov-S/KorDevTeam-web"
COPY --from=production-dependencies --chown=node:node /app/node_modules /app/node_modules
COPY --from=content-release-build --chown=node:node /app/build/content-release/content-release.mjs /app/content-release.mjs
COPY --from=content-release-build --chown=node:node /app/public/content/blog.ru.json /app/public/content/blog.ru.json
COPY --from=content-release-build --chown=node:node /app/public/blog/*.md /app/public/blog/
COPY --from=content-release-build --chown=node:node /app/content/portfolio/cases/*.json /app/content/portfolio/cases/
COPY --from=content-release-build --chown=node:node /app/content/services.ru.json /app/content/services.ru.json
RUN test "${#RELEASE_SHA}" = 40 && printf '%s' "$RELEASE_SHA" | grep -Eq '^[a-f0-9]{40}$'
USER node
CMD ["node","/app/content-release.mjs","manifest"]

FROM node:22.22.0-alpine AS production
WORKDIR /app
ENV NODE_ENV=production PORT=3001 CONTENT_CACHE_TTL_SECONDS=0 CONTENT_DIST_ROOT=/app/build/client SQLITE_PATH=/app/server/data/content.sqlite
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
LABEL org.opencontainers.image.revision=$RELEASE_SHA
COPY --from=production-dependencies --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/build/client /app/build/client
COPY --from=build --chown=node:node /app/build/server /app/build/server
COPY --from=build --chown=node:node /app/server /app/server
COPY --from=build --chown=node:node /app/drizzle /app/drizzle
COPY --from=build --chown=node:node /app/scripts/migrate-production.mjs /app/scripts/migrate-production.mjs
COPY --from=build --chown=node:node /app/scripts/runtime-entrypoint.sh /app/scripts/runtime-entrypoint.sh
RUN test -f /app/server/lead-worker.mjs && test -f /app/server/lead-retention.mjs && test -f /app/server/seo-collect.mjs
RUN mkdir -p /app/server/data /tmp/kordev-leads && chown node:node /app/server/data /tmp/kordev-leads && chmod 0700 /tmp/kordev-leads /app/scripts/runtime-entrypoint.sh
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=8s --start-period=20s --retries=6 CMD node -e "fetch('http://127.0.0.1:3001/api/health/ready',{signal:AbortSignal.timeout(6000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/runtime-entrypoint.sh"]
CMD ["node", "server/runtime.mjs"]
