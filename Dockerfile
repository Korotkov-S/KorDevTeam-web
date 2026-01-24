# Multi-stage build for React app
FROM node:22-alpine AS build

# Enable corepack for yarn
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY .yarn ./.yarn
COPY .yarnrc.yml ./

# Install dependencies
RUN yarn install --immutable --frozen-lockfile

# Copy source code
COPY . .

# Build the application with static blog pages
RUN yarn build

# Full production image: serves built static files + API (admin uploads, content editing, etc.)
FROM node:22-alpine AS production-app

RUN corepack enable
WORKDIR /app

# Install dependencies (includes server deps like express)
COPY package.json yarn.lock ./
COPY .yarn ./.yarn
COPY .yarnrc.yml ./
RUN yarn install --immutable --frozen-lockfile

# Copy runtime assets
COPY --from=build /app/dist /app/dist
COPY --from=build /app/server /app/server
COPY --from=build /app/scripts /app/scripts

# Optional: keep repo content folders for local/dev-style flows and backward compatibility
COPY --from=build /app/public /app/public
COPY --from=build /app/src/blog /app/src/blog

ENV NODE_ENV=production
ENV PORT=80
ENV CONTENT_DIST_ROOT=/app/dist

EXPOSE 80
CMD ["node", "server/index.js"]

# Production stage with Nginx
FROM nginx:1.25-alpine AS production

# Copy custom nginx configuration (SPA fallback, optional static .html pages)
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]