FROM node:20.20.0-alpine AS builder
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig*.json vite.config.ts vitest.config.ts eslint.config.js index.html ./
COPY src ./src
COPY public ./public
RUN pnpm build

FROM caddy:2.9.1-alpine AS runtime
RUN addgroup -S -g 10001 worksheet && adduser -S -D -H -u 10001 -G worksheet worksheet \
    && cp /usr/bin/caddy /usr/local/bin/caddy-unprivileged \
    && chmod 0755 /usr/local/bin/caddy-unprivileged
COPY --from=builder --chown=10001:10001 /build/dist /srv
COPY --chown=10001:10001 docker/Caddyfile.static /etc/caddy/Caddyfile
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=8s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
CMD ["caddy-unprivileged", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
