#!/usr/bin/env bash
# Atualiza o app no servidor, sem sudo (exceto o restart liberado pelo install.sh).
# NO_PULL=1 pula o git pull; NO_RESTART=1 pula o restart e a verificação.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
NODE_VERSION=24.22.0
UNIT=lugom-limpezas

[ -n "${NO_PULL:-}" ] || git pull --ff-only

# Node 24 próprio do app; o Node do sistema não é tocado.
if [ "$(.node/bin/node -v 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
  case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64) ARCH=arm64 ;; *) echo "Arquitetura não suportada: $(uname -m)" >&2; exit 1 ;; esac
  FILE="node-v$NODE_VERSION-linux-$ARCH.tar.xz"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "Baixando Node $NODE_VERSION…"
  curl -fsSL -o "$TMP/$FILE" "https://nodejs.org/dist/v$NODE_VERSION/$FILE"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | grep " $FILE\$" > "$TMP/sum"
  (cd "$TMP" && sha256sum -c sum >/dev/null)
  rm -rf .node && mkdir .node
  tar -xJf "$TMP/$FILE" -C .node --strip-components=1
fi
export PATH="$DIR/.node/bin:$PATH"

npm ci
npm run build

[ -z "${NO_RESTART:-}" ] || { echo "Build pronto (sem reiniciar)."; exit 0; }

sudo -n systemctl restart "$UNIT"

PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 || true)"
URL="http://127.0.0.1:${PORT:-10061}/api/environments"
for _ in $(seq 1 20); do
  if curl -fsS "$URL" >/dev/null 2>&1; then echo "OK: $URL respondeu."; exit 0; fi
  sleep 1
done
echo "ERRO: $URL não respondeu depois do restart." >&2
sudo -n systemctl status "$UNIT" --no-pager >&2 || true
journalctl -u "$UNIT" -n 30 --no-pager >&2 2>&1 || true
exit 1
