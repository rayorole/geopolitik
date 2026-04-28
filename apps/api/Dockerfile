# syntax=docker/dockerfile:1.7
# Multi-stage build for apps/api on Bun.
# Run from repo root: docker build -f apps/api/Dockerfile -t geopolitik-api .

FROM oven/bun:1.3.5-alpine AS base
WORKDIR /repo

# ---------- Install ----------
FROM base AS install
COPY package.json bun.lockb turbo.json tsconfig.base.json biome.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN bun install --frozen-lockfile

# ---------- Build ----------
FROM install AS build
COPY packages packages
COPY apps/api apps/api
RUN bun build apps/api/src/server.ts \
	--target=bun \
	--outdir=apps/api/dist \
	--minify

# ---------- Runtime ----------
FROM oven/bun:1.3.5-alpine AS runtime
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/api/dist ./dist
COPY --from=build --chown=app:app /repo/packages/db/drizzle ./drizzle
COPY --from=install --chown=app:app /repo/node_modules ./node_modules
COPY --from=install --chown=app:app /repo/packages ./packages

USER app
ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["bun", "run", "dist/server.js"]
