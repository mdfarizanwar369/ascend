FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY backend backend
RUN npm run build --workspace shared && npm run build --workspace backend

FROM base AS production-dependencies
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm ci --omit=dev --workspace backend --workspace shared --include-workspace-root=false --no-audit --no-fund && npm cache clean --force

FROM base AS runner
ENV NODE_ENV=production PORT=4000 NODE_OPTIONS="--max-old-space-size=256"
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/shared/package.json ./shared/package.json
COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/migrations ./backend/dist/migrations
USER node
EXPOSE 4000
CMD ["node", "backend/dist/src/server.js"]
