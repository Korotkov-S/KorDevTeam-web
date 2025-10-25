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

# Production stage with Nginx
FROM nginx:1.25-alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]