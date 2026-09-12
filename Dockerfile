FROM node:22.22.0-alpine AS dependencies
WORKDIR /app
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM dependencies AS build
COPY . .
# CI supplies the exact commit; local Compose uses an explicit rehearsal value.
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
RUN test -n "$RELEASE_SHA" && yarn build

FROM dependencies AS production-dependencies
RUN yarn plugin import workspace-tools && yarn workspaces focus --all --production

FROM node:22.22.0-alpine AS production
WORKDIR /app
ENV NODE_ENV=production PORT=3001 CONTENT_DIST_ROOT=/app/build/client SQLITE_PATH=/app/server/data/content.sqlite
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
