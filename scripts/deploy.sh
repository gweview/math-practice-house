#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null 2>&1 || { echo "缺少 Docker" >&2; exit 1; }
docker compose config >/dev/null
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps
curl --retry 12 --retry-delay 1 --retry-all-errors -fsS "http://${BIND_ADDRESS:-127.0.0.1}:${PORT:-8088}/health" >/dev/null
echo "部署完成：http://${BIND_ADDRESS:-127.0.0.1}:${PORT:-8088}"
