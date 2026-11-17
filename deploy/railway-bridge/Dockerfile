FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS="--max-old-space-size=64"
COPY --chown=node:node server.cjs ./server.cjs
COPY --chown=node:node server.cjs ./backend/dist/src/server.js
USER node
EXPOSE 4000
CMD ["node","server.cjs"]
