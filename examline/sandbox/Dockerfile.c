# Imagen sandbox para compilar y ejecutar código C de exámenes de forma aislada.
# Pensada para correr con: podman run --rm --network=none --read-only --tmpfs=/tmp:rw,exec ...
# (ver argumentosContenedor en codeExecution.service.ts para los flags completos)

FROM alpine:3.20

# gcc + musl-dev para compilar; nada más
RUN apk add --no-cache gcc musl-dev  && addgroup -S sandbox && adduser -S -G sandbox -h /home/sandbox sandbox

WORKDIR /code
# Igual que en las otras imágenes: el código se monta de solo lectura en /code.
# El binario compilado va a /tmp (único lugar escribible del contenedor).
RUN chmod 755 /code

USER sandbox

# No se define ENTRYPOINT/CMD: el service pasa `sh -c "gcc /code/... -o /tmp/code.out && exec /tmp/code.out"`
