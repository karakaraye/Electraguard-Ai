FROM node:24.22.3-bookworm-slim

WORKDIR /app
RUN chown node:node /app
USER node
ENV NEXT_TELEMETRY_DISABLED=1 DJANGO_API_ORIGIN=http://gateway:8081
COPY --chown=node:node frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY --chown=node:node frontend/next.config.ts frontend/tsconfig.json ./
COPY --chown=node:node frontend/app ./app
COPY --chown=node:node frontend/lib ./lib
COPY --chown=node:node frontend/ui ./ui
COPY --chown=node:node frontend/messages ./messages
COPY --chown=node:node frontend/public ./public
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
