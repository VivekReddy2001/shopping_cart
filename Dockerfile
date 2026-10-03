# syntax=docker/dockerfile:1
# ── Kartly production image ──────────────────────────────────────────
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Run as the unprivileged "node" user that ships with the image.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["node", "server.js"]
