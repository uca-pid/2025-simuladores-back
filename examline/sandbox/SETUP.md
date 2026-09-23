# Setup del sandbox de ejecución de código (Podman rootless)

Pasos para correr en el Ubuntu Server por SSH, con el **mismo usuario no-root
que corre el backend** (nunca con sudo para los comandos de podman: rootless
significa justamente que no necesita privilegios).

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

Si el smoke test al final imprime `sandbox python OK` y `sandbox node OK`,
las imágenes están listas.

## 5. Verificar que el backend encuentre el binario `podman`

El servicio hace `spawn('podman', [...])`, así que Node necesita resolver
`podman` en el `PATH` del proceso que corre el backend (no solo en tu shell
de SSH). Si corrés el backend con systemd, pm2, o similar, confirmá que el
`PATH` de ese entorno incluye `/usr/bin` (donde apt instala podman):

```bash
which podman   # anotá la ruta
```

## 6. Probar la ejecución real

Con el backend corriendo (`npm run dev` o `npm start`), pegale al endpoint
`/code-execution/execute` autenticado como profesor, o corré la suite
existente:

```bash
npm test -- codeExecution
```

Como ahora cada test dispara un `podman run` real (arranque de contenedor,
no solo un `spawn` directo), puede ser más lento que antes. Si Jest empieza a
tirar timeouts, subí el timeout default en `jest.config.cjs` o pasale
`--testTimeout=20000`.

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
  cada ejecución monta solo su propio archivo temporal, nunca el directorio
  completo.

Documentar esto (con el output real de cada intento bloqueado) es justo el
tipo de evidencia que pide el objetivo de "modelo de amenazas" del TF.
