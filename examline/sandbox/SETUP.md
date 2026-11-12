# Setup del sandbox de ejecución de código (Podman rootless)

## 1. Instalar Podman y dependencias

```bash
sudo apt update
sudo apt install -y podman uidmap slirp4netns fuse-overlayfs
```

- `uidmap` da `newuidmap`/`newgidmap`, necesarios para los user namespaces del modo rootless.
- `slirp4netns` es la red por default de podman rootless (no la vamos a usar en los contenedores del sandbox, que corren con `--network=none`, pero podman la necesita instalada de todas formas).
- `fuse-overlayfs` es el storage driver recomendado para rootless.

## 2. Verificar/configurar subuid y subgid

Rootless necesita un rango de UIDs/GIDs delegado a tu usuario para los
namespaces:

```bash
grep "^$(whoami):" /etc/subuid /etc/subgid
```

Si no devuelve nada, agregalo (con sudo, una única vez):

```bash
sudo usermod --add-subuids 200000-265535 --add-subgids 200000-265535 $(whoami)
podman system migrate
```

## 3. Habilitar "lingering" para tu usuario (importante, si no los límites de memoria/CPU no se aplican)

Rootless podman delega los límites de `--memory`/`--cpus`/`--pids-limit` a
cgroups v2 vía systemd --user. Si el backend corre como proceso lanzado por
SSH (o systemd service de usuario) y no hay una sesión de systemd persistente,
esa delegación puede no estar disponible y los límites de recursos quedan
sin efecto en silencio — justo lo que no queremos en un sandbox de seguridad.

```bash
sudo loginctl enable-linger $(whoami)
```

Verificá que cgroups v2 esté delegando cpu/memory/pids:

```bash
cat /sys/fs/cgroup/cgroup.controllers
# Debería listar: cpu io memory pids (entre otros)
```

## 4. Buildear las imágenes sandbox

```bash
cd examline/sandbox
chmod +x build.sh
./build.sh
```

Si el smoke test al final imprime `sandbox python OK`, `sandbox node OK` y
`sandbox c OK`, las imágenes están listas.

## 5. Verificar que el backend encuentre el binario `podman`

El servicio hace `spawn('podman', [...])`, así que Node necesita resolver
`podman` en el `PATH` del proceso que corre el backend (no solo en tu shell
de SSH). Si corrés el backend con systemd, pm2, o similar, confirmá que el
`PATH` de ese entorno incluye `/usr/bin` (donde apt instala podman):

```bash
which podman   # anotá la ruta
```

## 6. Activar el sandbox en el backend

La ejecución en contenedores se activa con una variable de entorno (si no
está, el backend ejecuta el código en el mismo servidor, que es lo que se usa
en Render, donde no se pueden correr contenedores):

```bash
EJECUCION_CODIGO=podman
```

Al arrancar, el backend verifica que `podman` esté instalado y que las tres
imágenes existan. Si está todo bien muestra:

```
🧪 Ejecución de código de alumnos: podman
```

Si falta algo, no arranca y explica qué falta.

Para probar en una compu de desarrollo con Docker en vez de Podman:

```bash
RUNTIME=docker ./build.sh
EJECUCION_CODIGO=docker npm run dev
```

## 7. Chequeo de seguridad manual (opcional pero recomendado para el TF)

Para el modelo de amenazas, vale la pena documentar intentos de escape
bloqueados. Algunos que podés probar a mano con `podman run` directo (no
hace falta pasar por el backend):

- **Fork bomb**: un script que hace fork infinito → debería frenar por
  `--pids-limit=64` en vez de tumbar el server.
- **Acceso a red**: `socket.connect(...)` o `requests.get(...)` → debería
  fallar por `--network=none`.
- **Escritura fuera de /tmp**: intentar escribir en `/code/script.py` o en
  `/etc` → debería fallar por `--read-only`.
- **Lectura de archivos del host montados por otro alumno**: no aplica,
  cada ejecución monta solo su propio directorio temporal (código y datasets
  de esa parte), de solo lectura en `/code`.
- **Variables de entorno del servidor**: `os.environ` / `process.env` /
  `getenv` dentro del contenedor no ven la base de datos ni el JWT: el
  contenedor solo tiene el entorno de la imagen.

En C se compila y se ejecuta dentro del mismo contenedor: el binario va a
`/tmp`, que es lo único escribible (y por eso en C se monta con `exec`).

