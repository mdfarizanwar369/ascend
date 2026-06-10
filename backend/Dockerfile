FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
RUN npm install

FROM deps AS build
COPY shared shared
COPY backend backend
RUN npm run build --workspace shared
RUN npm run build --workspace backend

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/migrations backend/dist/migrations
COPY --from=build /app/backend/package.json backend/package.json
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
