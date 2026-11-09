#!/usr/bin/env bash
# Construye las imágenes sandbox usadas por codeExecution.service.ts.
# Correr desde el Ubuntu Server, parado en esta carpeta (sandbox/), con el
# usuario NO-root que corre el backend (rootless: no usar sudo acá).
#
# Uso: ./build.sh                 (con podman)
#      RUNTIME=docker ./build.sh  (con docker, ej. para probar en una compu de desarrollo)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
RUNTIME="${RUNTIME:-podman}"

echo "==> Construyendo examline-sandbox-python..."
"$RUNTIME" build -t examline-sandbox-python -f Dockerfile.python .

echo "==> Construyendo examline-sandbox-node..."
"$RUNTIME" build -t examline-sandbox-node -f Dockerfile.node .

echo "==> Construyendo examline-sandbox-c..."
"$RUNTIME" build -t examline-sandbox-c -f Dockerfile.c .

echo "==> Listo. Imágenes disponibles:"
"$RUNTIME" images | grep examline-sandbox

echo
echo "==> Smoke test rápido:"
"$RUNTIME" run --rm --network=none --read-only --tmpfs=/tmp:rw,size=16m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  examline-sandbox-python python -c "print('sandbox python OK')"

"$RUNTIME" run --rm --network=none --read-only --tmpfs=/tmp:rw,size=16m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  examline-sandbox-node node -e "console.log('sandbox node OK')"

"$RUNTIME" run --rm --network=none --read-only --tmpfs=/tmp:rw,exec,size=16m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  examline-sandbox-c sh -c 'printf "#include <stdio.h>\nint main(){puts(\"sandbox c OK\");return 0;}\n" > /tmp/t.c && gcc /tmp/t.c -o /tmp/t && /tmp/t'
