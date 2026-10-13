# Container for Cloud Run (P-01). Build: docker build -t bank-agent-assist .
# The app needs no secrets at build time. Gemini credentials come from the runtime environment
# (Vertex AI through the Cloud Run service account, or GEMINI_API_KEY from Secret Manager).

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
# next.config.ts builds a self-contained server (output: "standalone") rooted at the monorepo.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
