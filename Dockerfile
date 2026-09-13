FROM node:22.22.0-alpine AS dependencies
WORKDIR /app
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM dependencies AS content-migration
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
LABEL org.opencontainers.image.revision=$RELEASE_SHA
COPY tsconfig.json tsconfig.server.json ./
COPY src/server/content/repository.ts src/server/content/types.ts src/server/content/migration.ts ./src/server/content/
COPY src/server/db/client.ts src/server/db/schema.ts ./src/server/db/
COPY src/lib/blogPresentation.mjs ./src/lib/blogPresentation.mjs
COPY server/utils/contentMeta.js ./server/utils/contentMeta.js
COPY server/data/content.sqlite ./server/data/content.sqlite
COPY public/blog/*.md ./public/blog/
COPY public/content/blog.ru.json public/content/projects.ru.json ./public/content/
COPY src/blog/*.md ./src/blog/
COPY scripts/migrate-content-to-postgres.ts scripts/verify-content-migration.ts scripts/bootstrap-content-check.mjs scripts/release-files.mjs ./scripts/
RUN test "${#RELEASE_SHA}" = 40 && printf '%s' "$RELEASE_SHA" | grep -Eq '^[a-f0-9]{40}$'
USER node
CMD ["node", "--import", "tsx", "scripts/migrate-content-to-postgres.ts", "--dry-run"]

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
RUN mkdir -p /app/server/data && chown node:node /app/server/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=8s --start-period=20s --retries=6 CMD node -e "fetch('http://127.0.0.1:3001/api/health/ready',{signal:AbortSignal.timeout(6000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/runtime.mjs"]
