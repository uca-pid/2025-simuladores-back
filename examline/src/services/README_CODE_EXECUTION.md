# Servicio de Ejecución de Código

## Estado Actual

Actualmente el código se ejecuta directamente en el servidor usando:
- **Python**: Comando `python` del sistema
- **JavaScript**: Comando `node` del sistema

## Requisitos del Sistema

### Python 3.11
Asegúrate de tener Python 3.11 instalado:
```bash
python --version
# Debería mostrar: Python 3.11.x
```

En Windows, si tienes múltiples versiones:
```bash
py -3.11 --version
```

### Node.js
Para ejecutar código JavaScript:
```bash
node --version
# Debería mostrar: v18.x o superior
```

## Seguridad Actual

⚠️ **IMPORTANTE**: La implementación actual tiene limitaciones de seguridad:

1. **Ejecución directa**: El código se ejecuta en el mismo servidor
2. **Límites básicos**: Solo timeout y memoria limitada
3. **Sin aislamiento**: El código puede acceder a recursos del sistema

**Recomendación**: Usar solo en desarrollo o con código confiable.

## Migración a Docker (Recomendado para Producción)

### ¿Por qué Docker?

1. **Aislamiento completo**: El código se ejecuta en un contenedor separado
2. **Sin acceso a red**: `--network none` previene conexiones externas
3. **Límites de recursos**: CPU y memoria estrictamente controlados
4. **Reproducibilidad**: Mismo entorno para todos los usuarios
5. **Seguridad**: El contenedor se destruye después de cada ejecución

### Implementación con Docker

#### 1. Instalar Docker
```bash
# Windows/Mac: Descargar Docker Desktop
# Linux:
sudo apt-get update
sudo apt-get install docker.io
```

#### 2. Descargar imágenes necesarias
```bash
docker pull python:3.11-alpine
docker pull node:18-alpine
```

#### 3. Modificar el servicio

En `codeExecution.service.ts`, descomentar el método `executeInDocker` y modificar:

```typescript
async executeCode(
  code: string,
  language: 'python' | 'javascript',
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { timeout = 10000, maxMemory = '128m' } = options;

  try {
    // Usar Docker en producción
    if (process.env.USE_DOCKER === 'true') {
      return await this.executeInDocker(code, language, options);
    }
    
    // Fallback a ejecución directa (solo desarrollo)
    if (language === 'python') {
      return await this.executePython(code, timeout);
    } else if (language === 'javascript') {
      return await this.executeJavaScript(code, timeout);
    }
  } catch (error: any) {
    // ...
  }
}
```

#### 4. Configurar variables de entorno

En `.env`:
```env
USE_DOCKER=true
DOCKER_PYTHON_IMAGE=python:3.11-alpine
DOCKER_NODE_IMAGE=node:18-alpine
CODE_EXECUTION_TIMEOUT=10000
CODE_EXECUTION_MAX_MEMORY=128m
CODE_EXECUTION_MAX_CPU=0.5
```

#### 5. Ejemplo de comando Docker

Para Python:
```bash
docker run --rm \
  --network none \
  --memory 128m \
  --cpus 0.5 \
  --read-only \
  -v /ruta/al/codigo.py:/code.py:ro \
  python:3.11-alpine \
  python /code.py
```

Para JavaScript:
```bash
docker run --rm \
  --network none \
  --memory 128m \
  --cpus 0.5 \
  --read-only \
  -v /ruta/al/codigo.js:/code.js:ro \
  node:18-alpine \
  node /code.js
```

### Características de Seguridad Docker

- `--rm`: Elimina el contenedor automáticamente
- `--network none`: Sin acceso a red
- `--memory 128m`: Límite de memoria RAM
- `--cpus 0.5`: Límite de uso de CPU
- `--read-only`: Sistema de archivos de solo lectura
- `-v ... :ro`: Monta el código como solo lectura

### Alternativas Avanzadas

#### 1. Sandbox más robusto
Considera usar:
- **gVisor**: Runtime de contenedores más seguro
- **Kata Containers**: Máquinas virtuales ligeras

#### 2. Servicios externos
- **Judge0**: API de ejecución de código
- **Piston**: Sistema de ejecución de código open-source
- **AWS Lambda**: Ejecución serverless

#### 3. Kubernetes
Para escalabilidad:
- Jobs de Kubernetes para ejecutar código
- Autoscaling basado en carga
- Network policies para aislamiento

## Testing

### Prueba básica
```bash
curl -X POST http://localhost:3001/code-execution/run \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "print(\"Hello, World!\")",
    "language": "python"
  }'
```

### Prueba de timeout
```python
import time
time.sleep(15)  # Debería fallar por timeout
print("Esto no se ejecutará")
```

### Prueba de límite de memoria
```python
# Intentar usar mucha memoria
big_list = [0] * (10**9)  # Debería fallar
```

## Monitoreo y Logs

Agregar logging para monitorear ejecuciones:

```typescript
// En codeExecution.service.ts
import logger from '../utils/logger';

logger.info('Ejecutando código', {
  language,
  codeLength: code.length,
  userId: userId,
  examId: examId
});

logger.warn('Timeout excedido', {
  language,
  timeout,
  executionTime
});
```

## Roadmap de Seguridad

1. ✅ Ejecución básica con timeout
2. ⏳ Migración a Docker
3. ⏳ Límites de recursos estrictos
4. ⏳ Detección de código malicioso
5. ⏳ Rate limiting por usuario
6. ⏳ Auditoría de ejecuciones
7. ⏳ Sandbox con gVisor

## Contribuir

Si implementas mejoras de seguridad, por favor documenta:
1. El problema que resuelve
2. Cómo probarlo
3. Impacto en rendimiento
4. Configuración necesaria
