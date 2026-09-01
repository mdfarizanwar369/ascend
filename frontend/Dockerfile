FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm install

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ASCEND_COACH_V1
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ASCEND_COACH_V1=$NEXT_PUBLIC_ASCEND_COACH_V1
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
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
