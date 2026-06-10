FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm install

FROM deps AS build
COPY shared shared
COPY frontend frontend
RUN npm run build --workspace shared
RUN npm run build --workspace frontend

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/frontend/.next frontend/.next
COPY --from=build /app/frontend/public frontend/public
COPY --from=build /app/frontend/package.json frontend/package.json
WORKDIR /app/frontend
EXPOSE 3000
CMD ["npm", "run", "start"]

