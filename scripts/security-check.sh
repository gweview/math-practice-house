#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
URL="http://${BIND_ADDRESS:-127.0.0.1}:${PORT:-8088}"
echo "== Compose 配置 =="; docker compose config --quiet
echo "== 容器状态 =="; docker compose ps
echo "== 端口映射（web 应为空；gateway 应符合 BIND_ADDRESS） =="; docker compose port web 8080 2>/dev/null || true; docker compose port gateway 8080
echo "== 用户/只读/权限/健康检查 =="
for c in math-worksheet-web-1 math-worksheet-gateway-1; do docker inspect -f '{{.Name}} user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} privileged={{.HostConfig.Privileged}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} caps={{json .HostConfig.CapDrop}}' "$c"; done
echo "== 安全响应头 =="; curl -fsSI "$URL" | grep -iE 'content-security-policy|x-content-type-options|x-frame-options|referrer-policy|permissions-policy|strict-transport-security'
echo "== 外部引用/跟踪扫描 =="
external_refs=$(grep -RIE 'https?://|google-analytics|googletagmanager|facebook\.net' src public index.html --exclude='*.test.*' | grep -v 'http://www.w3.org/2000/svg' || true)
if [ -n "$external_refs" ]; then echo "$external_refs"; echo "发现外部资源或跟踪引用" >&2; exit 1; fi
echo "未发现第三方运行时资源或跟踪代码"
echo "== 明文密钥模式扫描 =="
secret_hits=$(grep -RIE '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key[[:space:]]*=|password[[:space:]]*=|secret[[:space:]]*=)' . --exclude-dir=node_modules --exclude-dir=.git || true)
if [ -n "$secret_hits" ]; then echo "$secret_hits"; echo "发现疑似明文密钥" >&2; exit 1; fi
echo "未发现明文密钥模式"
echo "安全检查通过"
