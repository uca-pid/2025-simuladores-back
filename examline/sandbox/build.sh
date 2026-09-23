#!/usr/bin/env bash
# Construye las imágenes sandbox usadas por codeExecution.service.ts.
# Correr desde el Ubuntu Server, parado en esta carpeta (sandbox/), con el
# usuario NO-root que corre el backend (rootless: no usar sudo acá).
#
# Uso: ./build.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Construyendo examline-sandbox-python..."
podman build -t examline-sandbox-python -f Dockerfile.python .

echo "==> Construyendo examline-sandbox-node..."
podman build -t examline-sandbox-node -f Dockerfile.node .

echo "==> Listo. Imágenes disponibles:"
podman images | grep examline-sandbox

echo
echo "==> Smoke test rápido:"
podman run --rm --network=none --read-only --tmpfs=/tmp:rw,size=16m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  examline-sandbox-python python -c "print('sandbox python OK')"

podman run --rm --network=none --read-only --tmpfs=/tmp:rw,size=16m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  examline-sandbox-node node -e "console.log('sandbox node OK')"
