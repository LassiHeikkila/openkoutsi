# ── Build stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# NEXT_PUBLIC_API_URL is baked into the JS bundle at build time.
# Set it to the URL your browser will use to reach the backend,
# e.g. https://api.example.com or http://your-server-ip:8000
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# standalone output contains the server; static assets must be copied in.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
