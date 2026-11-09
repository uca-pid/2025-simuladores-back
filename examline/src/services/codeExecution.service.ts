import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir, rm } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import os from 'os';

const execAsync = promisify(exec);

interface DatasetFile {
  name: string; // nombre de archivo que el código del alumno espera abrir, ej. "vuelos.csv"
  content: string;
}

interface ExecutionOptions {
  timeout?: number; // en milisegundos
  maxMemory?: string; // sin efecto: el límite real es LIMITE_MEMORIA_MB (ver ejecutarProceso y argumentosContenedor)
  input?: string; // Input para stdin del programa
  datasets?: DatasetFile[]; // archivos de datos que se dejan junto al código, accesibles con open() por nombre relativo
}

interface ExecutionResult {
  output: string;
  error: string | null;
  exitCode: number;
  executionTime: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Resultado crudo de correr un proceso del alumno (antes de armar el ExecutionResult). */
interface ProcessRun {
  stdout: string;
  stderr: string;
  exitCode: number;
  isTimeout: boolean;
  salidaExcedida: boolean;
  spawnError: string | null;
}

// Límites para el código de los alumnos, que corre en este mismo servidor.
// Tope de salida por stream: un print en bucle infinito no puede llenar la memoria del back.
const MAX_SALIDA_BYTES = 1024 * 1024;
// Memoria máxima del programa del alumno (Python y C vía ulimit en Linux, Node vía --max-old-space-size).
const LIMITE_MEMORIA_MB = 256;
// Tamaño máximo de archivo que puede escribir, en KB.
const LIMITE_ARCHIVO_KB = 10 * 1024;
// En Linux cada ejecución corre en su propio grupo de procesos, para poder matar
// también los procesos hijos que lance el alumno. En Windows (desarrollo) no aplica.
const ES_LINUX = process.platform !== 'win32';

/**
 * Dónde corre el código de los alumnos (variable EJECUCION_CODIGO):
 * - 'local' (por defecto): en este mismo servidor, con los límites de ejecutarProceso.
 *   Es lo que se usa en Render, que no permite contenedores.
 * - 'podman' o 'docker': cada ejecución en un contenedor descartable, sin red,
 *   de solo lectura y sin permisos (ver sandbox/SETUP.md). Requiere un servidor propio.
 */
export type ModoEjecucion = 'local' | 'podman' | 'docker';

export function modoEjecucion(): ModoEjecucion {
  const modo = (process.env.EJECUCION_CODIGO || 'local').trim().toLowerCase();
  return modo === 'podman' || modo === 'docker' ? modo : 'local';
}

/** Imágenes que construye sandbox/build.sh. */
export const IMAGENES_SANDBOX: Record<'python' | 'javascript' | 'c', string> = {
  python: 'examline-sandbox-python',
  javascript: 'examline-sandbox-node',
  c: 'examline-sandbox-c'
};

// Margen para arrancar el contenedor, que no se le descuenta al tiempo del alumno.
const ARRANQUE_CONTENEDOR_MS = 3000;
// En C se compila y corre dentro del mismo contenedor: si gcc falla, el script
// sale con este código y esta marca antes de los errores de compilación.
const SALIDA_ERROR_COMPILACION = 97;
const MARCA_ERROR_COMPILACION = '##ERROR_DE_COMPILACION##';

/**
 * Argumentos de `podman run` / `docker run` para correr un archivo del alumno.
 * `dirEjecucion` (código + datasets) se monta de solo lectura en /code.
 */
export function argumentosContenedor(
  lenguaje: 'python' | 'javascript' | 'c',
  dirEjecucion: string,
  nombreContenedor: string,
  archivo: string
): string[] {
  const comando: Record<typeof lenguaje, string[]> = {
    python: ['python', `/code/${archivo}`],
    javascript: ['node', `--max-old-space-size=${LIMITE_MEMORIA_MB}`, `/code/${archivo}`],
    c: [
      'sh', '-c',
      `gcc /code/${archivo} -o /tmp/code.out -lm 2>/tmp/compilacion.txt || ` +
      `{ echo "${MARCA_ERROR_COMPILACION}" >&2; cat /tmp/compilacion.txt >&2; exit ${SALIDA_ERROR_COMPILACION}; }; ` +
      `exec /tmp/code.out`
    ]
  };

  return [
    'run', '--rm', '-i',
    '--name', nombreContenedor,
    '--network=none',
    '--read-only',
    // /tmp es lo único escribible; en C además tiene que permitir ejecutar el binario compilado
    `--tmpfs=/tmp:rw,${lenguaje === 'c' ? 'exec,' : ''}size=16m`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    `--memory=${LIMITE_MEMORIA_MB}m`,
    `--memory-swap=${LIMITE_MEMORIA_MB}m`,
    '--cpus=1',
    '--pids-limit=64',
    '-v', `${dirEjecucion}:/code:ro`,
    '-w', '/code',
    IMAGENES_SANDBOX[lenguaje],
    ...comando[lenguaje]
  ];
}

/**
 * Chequeo al arrancar el servidor: si EJECUCION_CODIGO pide contenedores, el
 * programa tiene que estar instalado y las imágenes construidas. Si no, mejor
 * no arrancar que fallar recién cuando un alumno ejecuta código en un examen.
 */
export async function verificarEjecucionCodigo(): Promise<ModoEjecucion> {
  const modo = modoEjecucion();
  if (modo === 'local') return modo;

  await new Promise<void>((resolve, reject) => {
    execFile(modo, ['image', 'inspect', ...Object.values(IMAGENES_SANDBOX)], { timeout: 20000, windowsHide: true }, (error) => {
      if (error) {
        reject(new Error(
          `EJECUCION_CODIGO=${modo}, pero no se encontró ${modo} o faltan las imágenes ` +
          `${Object.values(IMAGENES_SANDBOX).join(', ')}. Ver sandbox/SETUP.md (construirlas con sandbox/build.sh).`
        ));
      } else {
        resolve();
      }
    });
  });

  return modo;
}

/**
 * Servicio para ejecutar código de forma segura
 * 
 * Arquitectura diseñada para migrar fácilmente a Docker:
 * - Cada ejecución es aislada en archivos temporales
 * - Límites de tiempo y memoria
 * - Fácil de reemplazar con llamadas a contenedores Docker
 */
class CodeExecutionService {
  private tempDir: string;

  constructor() {
    // Directorio temporal para archivos de código
    this.tempDir = path.join(os.tmpdir(), 'code-execution');
    this.initTempDir();
  }

  private async initTempDir() {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creando directorio temporal:', error);
    }
  }

  /**
   * Ejecuta código Python, JavaScript o C con los límites de ejecutarProceso.
   */
  async executeCode(
    code: string,
    language: 'python' | 'javascript' | 'c',
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { timeout = 10000, input = '' } = options;

    try {
      if (modoEjecucion() !== 'local' && ['python', 'javascript', 'c'].includes(language)) {
        return await this.ejecutarEnContenedor(code, language, timeout, input, options.datasets);
      }

      if (language === 'python') {
        return await this.executePython(code, timeout, input, options.datasets);
      } else if (language === 'javascript') {
        return await this.executeJavaScript(code, timeout, input, options.datasets);
      } else if (language === 'c') {
        return await this.executeC(code, timeout, input, options.datasets);
      } else {
        throw new Error(`Lenguaje no soportado: ${language}`);
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      return {
        output: '',
        error: error.message || 'Error desconocido',
        exitCode: 1,
        executionTime
      };
    }
  }

  /**
   * Ejecuta código Python (python del sistema), con los límites de ejecutarProceso.
   */
  private async executePython(code: string, timeout: number, input: string = '', datasets?: DatasetFile[]): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { dir, codeFile } = await this.createExecutionDir(code, '.py', datasets);

    try {
      // cwd = dir de ejecución: así open("archivo.csv") (ruta relativa) encuentra el dataset
      const run = await this.ejecutarProceso('python', [codeFile], { cwd: dir, input, timeout, limitarMemoria: true });
      return this.armarResultado(run, startTime, timeout);
    } finally {
      await this.cleanupExecutionDir(dir);
    }
  }

  /**
   * Ejecuta código JavaScript con Node.js, con los límites de ejecutarProceso.
   */
  private async executeJavaScript(code: string, timeout: number, input: string = '', datasets?: DatasetFile[]): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Inyectar polyfill de prompt() para Node.js
    const codeWithPromptPolyfill = this.injectPromptPolyfill(code);
    const { dir, codeFile } = await this.createExecutionDir(codeWithPromptPolyfill, '.js', datasets);

    try {
      // Node reserva mucha memoria virtual al arrancar, así que su límite va por
      // --max-old-space-size en vez de ulimit -v.
      const run = await this.ejecutarProceso(
        'node',
        [`--max-old-space-size=${LIMITE_MEMORIA_MB}`, codeFile],
        { cwd: dir, input, timeout, limitarMemoria: false }
      );
      return this.armarResultado(run, startTime, timeout);
    } finally {
      await this.cleanupExecutionDir(dir);
    }
  }

  /**
   * Ejecuta código C: compila con gcc y corre el binario resultante.
   *
   * La compilación tiene su propio presupuesto de tiempo (mismo valor que el
   * timeout de ejecución) separado del timeout de la corrida: así un programa
   * que compila rápido pero se cuelga en runtime no se beneficia del tiempo
   * "gastado" en compilar, y viceversa un programa que tarda en compilar no le
   * resta tiempo a su propia ejecución.
   */
  private async executeC(code: string, timeout: number, input: string = '', datasets?: DatasetFile[]): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { dir, codeFile } = await this.createExecutionDir(code, '.c', datasets);
    const binaryFile = path.join(dir, process.platform === 'win32' ? 'code.exe' : 'code.out');

    try {
      const compileResult = await this.compileC(codeFile, binaryFile, dir, timeout);
      if (!compileResult.success) {
        return {
          output: '',
          error: compileResult.error,
          exitCode: 1,
          executionTime: Date.now() - startTime
        };
      }

      const run = await this.ejecutarProceso(binaryFile, [], { cwd: dir, input, timeout, limitarMemoria: true });
      return this.armarResultado(run, startTime, timeout);
    } finally {
      await this.cleanupExecutionDir(dir);
    }
  }

  /**
   * Compila un archivo .c con gcc. Usa el mismo valor de timeout que la
   * ejecución, pero como presupuesto independiente (ver comentario de executeC).
   */
  private async compileC(
    codeFile: string,
    binaryFile: string,
    dir: string,
    compileTimeout: number
  ): Promise<{ success: boolean; error: string | null }> {
    const run = await this.ejecutarProceso('gcc', [codeFile, '-o', binaryFile, '-lm'], {
      cwd: dir,
      timeout: compileTimeout,
      limitarMemoria: false
    });

    if (run.spawnError) {
      return { success: false, error: `No se pudo compilar: ${run.spawnError}` };
    }
    if (run.isTimeout) {
      return { success: false, error: `Tiempo de compilación excedido (máximo ${compileTimeout}ms)` };
    }
    if (run.exitCode !== 0) {
      return { success: false, error: run.stderr || 'Error de compilación' };
    }
    return { success: true, error: null };
  }

  /**
   * Variables de entorno para el código del alumno: solo lo necesario para que
   * el intérprete o el binario funcionen. Nunca las del servidor (base de datos,
   * JWT, Cloudinary...), que el alumno podría leer con os.environ o process.env.
   */
  private entornoDelAlumno(dir: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: dir,
      TMPDIR: dir,
      TEMP: dir,
      TMP: dir,
      LANG: 'C.UTF-8',
      PYTHONIOENCODING: 'utf-8',
      PYTHONDONTWRITEBYTECODE: '1'
    };

    // En Windows (solo desarrollo) Python y gcc necesitan estas variables del sistema
    if (!ES_LINUX) {
      for (const clave of ['SystemRoot', 'windir', 'PATHEXT', 'ComSpec']) {
        if (process.env[clave]) env[clave] = process.env[clave];
      }
    }

    return env;
  }

  /**
   * Corre un proceso del alumno (o gcc) con los límites de seguridad:
   * entorno sin variables del servidor, tope de salida, corte forzado
   * (SIGKILL, incluidos sus procesos hijos en Linux) al vencer el tiempo,
   * y límite de memoria y de tamaño de archivo cuando corresponde.
   */
  private ejecutarProceso(
    comando: string,
    args: string[],
    opciones: {
      cwd: string;
      input?: string;
      timeout: number;
      limitarMemoria: boolean;
      // Para podman/docker: el CLI necesita el entorno del servidor (HOME, XDG_RUNTIME_DIR...).
      // El código del alumno igual no lo ve: corre dentro del contenedor con el entorno de la imagen.
      entornoDelServidor?: boolean;
      // Se llama además de matar el proceso (ej. borrar el contenedor, que sigue vivo si solo se mata el CLI)
      alCortar?: () => void;
    }
  ): Promise<ProcessRun> {
    const { cwd, input = '', timeout, limitarMemoria, entornoDelServidor = false, alCortar } = opciones;

    // En Linux, ulimit dentro de un sh que después hace exec del programa: los
    // límites quedan aplicados solo a ese proceso y sus hijos.
    let ejecutable = comando;
    let argumentos = args;
    if (ES_LINUX && limitarMemoria) {
      ejecutable = 'sh';
      argumentos = [
        '-c',
        `ulimit -v ${LIMITE_MEMORIA_MB * 1024}; ulimit -f ${LIMITE_ARCHIVO_KB * 2}; exec "$0" "$@"`,
        comando,
        ...args
      ];
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let bytesSalida = 0;
      let isTimeout = false;
      let salidaExcedida = false;
      let terminado = false;

      const proceso = spawn(ejecutable, argumentos, {
        windowsHide: true,
        cwd,
        env: entornoDelServidor ? process.env : this.entornoDelAlumno(cwd),
        detached: ES_LINUX
      });

      const matar = () => {
        alCortar?.();
        try {
          if (ES_LINUX && proceso.pid) {
            process.kill(-proceso.pid, 'SIGKILL');
          } else {
            proceso.kill('SIGKILL');
          }
        } catch {
          // El proceso ya había terminado
        }
      };

      const timeoutId = setTimeout(() => {
        isTimeout = true;
        matar();
      }, timeout);

      const capturar = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
        if (salidaExcedida) return;
        bytesSalida += data.length;
        if (bytesSalida > MAX_SALIDA_BYTES) {
          salidaExcedida = true;
          matar();
          return;
        }
        if (stream === 'stdout') stdout += data.toString();
        else stderr += data.toString();
      };

      proceso.stdout.on('data', capturar('stdout'));
      proceso.stderr.on('data', capturar('stderr'));

      // Si el programa termina sin leer stdin, escribirle da EPIPE: no es un error del alumno
      proceso.stdin.on('error', () => {});
      if (input) {
        // Asegurar que el input termine con nueva línea para que input()/scanf funcionen
        proceso.stdin.write(input.endsWith('\n') ? input : input + '\n');
      }
      proceso.stdin.end();

      const finalizar = (exitCode: number, spawnError: string | null) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timeoutId);
        resolve({ stdout, stderr, exitCode, isTimeout, salidaExcedida, spawnError });
      };

      proceso.on('close', (code) => finalizar(code ?? 1, null));
      proceso.on('error', (error) => finalizar(1, error.message));
    });
  }

  /**
   * Corre el código del alumno en un contenedor descartable (podman o docker)
   * con los límites de argumentosContenedor.
   */
  private async ejecutarEnContenedor(
    code: string,
    language: 'python' | 'javascript' | 'c',
    timeout: number,
    input: string,
    datasets?: DatasetFile[]
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const runtime = modoEjecucion();
    const extension = { python: '.py', javascript: '.js', c: '.c' }[language];
    const codigo = language === 'javascript' ? this.injectPromptPolyfill(code) : code;
    const { dir, codeFile } = await this.createExecutionDir(codigo, extension, datasets);
    const nombre = `examline-exec-${randomBytes(8).toString('hex')}`;
    // En C la compilación y la corrida comparten contenedor: cada una con su presupuesto (ver executeC)
    const presupuesto = (language === 'c' ? timeout * 2 : timeout) + ARRANQUE_CONTENEDOR_MS;

    try {
      const run = await this.ejecutarProceso(
        runtime,
        argumentosContenedor(language, dir, nombre, path.basename(codeFile)),
        {
          cwd: dir,
          input,
          timeout: presupuesto,
          limitarMemoria: false,
          entornoDelServidor: true,
          alCortar: () => this.borrarContenedor(runtime, nombre)
        }
      );

      if (language === 'c' && run.exitCode === SALIDA_ERROR_COMPILACION && run.stderr.startsWith(MARCA_ERROR_COMPILACION)) {
        return {
          output: '',
          error: run.stderr.slice(MARCA_ERROR_COMPILACION.length).trim() || 'Error de compilación',
          exitCode: 1,
          executionTime: Date.now() - startTime
        };
      }

      return this.armarResultado(run, startTime, timeout);
    } finally {
      await this.cleanupExecutionDir(dir);
    }
  }

  /** Borra a la fuerza un contenedor que hubo que cortar (por tiempo o por salida). */
  private borrarContenedor(runtime: ModoEjecucion, nombre: string) {
    execFile(runtime, ['rm', '-f', nombre], { timeout: 15000, windowsHide: true }, () => {});
  }

  /** Arma el ExecutionResult que devuelve el servicio a partir de la corrida. */
  private armarResultado(run: ProcessRun, startTime: number, timeout: number): ExecutionResult {
    const executionTime = Date.now() - startTime;

    if (run.spawnError) {
      return { output: '', error: run.spawnError, exitCode: 1, executionTime };
    }
    if (run.isTimeout) {
      return { output: run.stdout, error: `Tiempo de ejecución excedido (máximo ${timeout}ms)`, exitCode: 124, executionTime };
    }
    if (run.salidaExcedida) {
      return { output: run.stdout, error: `La salida superó el máximo permitido (${MAX_SALIDA_BYTES / 1024 / 1024} MB)`, exitCode: 1, executionTime };
    }
    return { output: run.stdout, error: run.stderr || null, exitCode: run.exitCode, executionTime };
  }

  /**
   * Inyecta un polyfill de prompt() para Node.js que usa readline-sync
   * Esto permite que el código JavaScript use prompt() como en el navegador
   */
  private injectPromptPolyfill(code: string): string {
    const polyfill = `
// Polyfill de prompt() para Node.js
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Array para almacenar las líneas de input
const inputLines = [];
let currentLineIndex = 0;

// Leer todas las líneas disponibles de stdin
rl.on('line', (line) => {
  inputLines.push(line);
});

// Función prompt() compatible con browser
global.prompt = function(message) {
  if (message) {
    process.stdout.write(message);
  }
  if (currentLineIndex < inputLines.length) {
    return inputLines[currentLineIndex++];
  }
  return null;
};

// Esperar a que se lean todas las líneas antes de ejecutar el código
rl.on('close', () => {
  // Código del usuario comienza aquí
  try {
`;

    const epilog = `
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
`;

    return polyfill + code + epilog;
  }

  /**
   * Valida la sintaxis del código sin ejecutarlo
   */
  async validateSyntax(code: string, language: 'python' | 'javascript' | 'c'): Promise<ValidationResult> {
    try {
      if (language === 'python') {
        return await this.validatePythonSyntax(code);
      } else if (language === 'javascript') {
        return await this.validateJavaScriptSyntax(code);
      } else if (language === 'c') {
        return await this.validateCSyntax(code);
      } else {
        return {
          valid: false,
          errors: [`Lenguaje no soportado: ${language}`]
        };
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Valida sintaxis de Python usando py_compile
   */
  private async validatePythonSyntax(code: string): Promise<ValidationResult> {
    const tempFile = await this.createTempFile(code, '.py');

    try {
      // Usar py_compile para validar sintaxis
      const validateScript = `import py_compile; py_compile.compile('${tempFile.replace(/\\/g, '\\\\')}', doraise=True)`;
      
      await execAsync(
        `python -c "${validateScript}"`,
        {
          timeout: 5000,
          windowsHide: true,
        }
      );

      return {
        valid: true,
        errors: []
      };

    } catch (error: any) {
      const errorOutput = error.stderr || error.message;
      return {
        valid: false,
        errors: [errorOutput]
      };

    } finally {
      await this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Valida sintaxis de JavaScript usando node --check
   */
  private async validateJavaScriptSyntax(code: string): Promise<ValidationResult> {
    const tempFile = await this.createTempFile(code, '.js');

    try {
      await execAsync(
        `node --check "${tempFile}"`,
        {
          timeout: 5000,
          windowsHide: true,
        }
      );

      return {
        valid: true,
        errors: []
      };

    } catch (error: any) {
      const errorOutput = error.stderr || error.message;
      return {
        valid: false,
        errors: [errorOutput]
      };

    } finally {
      await this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Valida sintaxis de C usando gcc -fsyntax-only (no genera binario)
   */
  private async validateCSyntax(code: string): Promise<ValidationResult> {
    const tempFile = await this.createTempFile(code, '.c');

    try {
      await execAsync(
        `gcc -fsyntax-only "${tempFile}"`,
        {
          timeout: 5000,
          windowsHide: true,
        }
      );

      return {
        valid: true,
        errors: []
      };

    } catch (error: any) {
      const errorOutput = error.stderr || error.message;
      return {
        valid: false,
        errors: [errorOutput]
      };

    } finally {
      await this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Crea un archivo temporal con el código
   */
  private async createTempFile(code: string, extension: string): Promise<string> {
    const randomName = randomBytes(16).toString('hex');
    const fileName = `code_${randomName}${extension}`;
    const filePath = path.join(this.tempDir, fileName);

    await writeFile(filePath, code, 'utf-8');
    return filePath;
  }

  /**
   * Elimina un archivo temporal
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error) {
      // Ignorar errores al eliminar (el archivo puede no existir)
      console.warn(`No se pudo eliminar archivo temporal: ${filePath}`);
    }
  }

  /**
   * Crea un directorio aislado y único para una ejecución, con el archivo de
   * código y (si corresponde) los datasets al lado, para que el código del
   * alumno pueda abrirlos por nombre relativo (ej. open("archivo.csv")).
   * El directorio es único por ejecución para que corridas concurrentes de
   * distintos alumnos no compartan ni pisen los mismos archivos de dataset.
   */
  private async createExecutionDir(
    code: string,
    extension: string,
    datasets?: DatasetFile[]
  ): Promise<{ dir: string; codeFile: string }> {
    const dir = path.join(this.tempDir, `exec_${randomBytes(16).toString('hex')}`);
    await mkdir(dir, { recursive: true });

    const codeFile = path.join(dir, `code${extension}`);
    await writeFile(codeFile, code, 'utf-8');

    if (datasets && datasets.length > 0) {
      // basename: un nombre como "../../x" no puede escribir fuera del directorio de ejecución
      await Promise.all(datasets.map(dataset =>
        writeFile(path.join(dir, path.basename(dataset.name)), dataset.content, 'utf-8')
      ));
    }

    return { dir, codeFile };
  }

  /**
   * Elimina el directorio de ejecución completo (código + dataset).
   */
  private async cleanupExecutionDir(dir: string): Promise<void> {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`No se pudo eliminar el directorio de ejecución: ${dir}`);
    }
  }

  /**
   * Ejecuta tests contra código dado
   * Usado por el profesor para validar tests antes de publicar
   */
  async runTests(
    code: string,
    language: 'python' | 'javascript' | 'c',
    testCases: Array<{ description: string; input: string; expectedOutput: string }>,
    options: ExecutionOptions = {}
  ): Promise<{
    testResults: Array<{
      description: string;
      passed: boolean;
      input: string;
      expectedOutput: string;
      actualOutput: string;
      error: string | null;
      executionTime: number;
    }>;
    totalTests: number;
    passedTests: number;
    score: number;
  }> {
    const testResults = [];
    let passedTests = 0;

    for (const testCase of testCases) {
      try {
        const result = await this.executeCode(code, language, {
          ...options,
          input: testCase.input
        });

        // Se normalizan los saltos de línea: en Windows Python imprime \r\n y el
        // output esperado (escrito en un textarea) usa \n.
        const actualOutput = result.output.replace(/\r\n/g, '\n').trim();
        const expectedOutput = testCase.expectedOutput.replace(/\r\n/g, '\n').trim();
        const passed = actualOutput === expectedOutput && result.exitCode === 0 && !result.error;

        if (passed) {
          passedTests++;
        }

        testResults.push({
          description: testCase.description,
          passed,
          input: testCase.input,
          expectedOutput,
          actualOutput,
          error: result.error,
          executionTime: result.executionTime
        });
      } catch (error: any) {
        testResults.push({
          description: testCase.description,
          passed: false,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: '',
          error: error.message,
          executionTime: 0
        });
      }
    }

    const totalTests = testCases.length;
    const score = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return {
      testResults,
      totalTests,
      passedTests,
      score
    };
  }
}

export default CodeExecutionService;
