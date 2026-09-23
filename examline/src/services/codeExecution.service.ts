import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import os from 'os';

const execAsync = promisify(exec);

interface ExecutionOptions {
  timeout?: number; // en milisegundos
  maxMemory?: string; // ej: '128m'
  input?: string; // Input para stdin del programa
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

type SupportedLanguage = 'python' | 'javascript';

// Imágenes construidas por sandbox/build.sh (ver sandbox/Dockerfile.python y
// sandbox/Dockerfile.node). Corren con usuario no-root dentro del contenedor.
const SANDBOX_IMAGES: Record<SupportedLanguage, string> = {
  python: 'examline-sandbox-python',
  javascript: 'examline-sandbox-node',
};

const CONTAINER_SCRIPT_PATH: Record<SupportedLanguage, string> = {
  python: '/code/script.py',
  javascript: '/code/script.js',
};

// Límite de salida por ejecución: evita que un programa haga flood de stdout
// y agote memoria/disco del backend antes de que el timeout llegue a actuar.
const MAX_OUTPUT_BYTES = 1_000_000; // 1MB

/**
 * Servicio para ejecutar código de forma aislada.
 *
 * Cada ejecución corre en un contenedor Podman (rootless) efímero, con:
 * - Sin red (--network=none): imposible exfiltrar datos o escanear la red interna
 * - Filesystem de solo lectura (--read-only + tmpfs acotado para /tmp)
 * - Sin capabilities de Linux (--cap-drop=ALL) ni escalado de privilegios
 *   (--security-opt=no-new-privileges)
 * - Límite de memoria, CPU y cantidad de procesos (--pids-limit, anti fork-bomb)
 * - Usuario no-root dentro del contenedor, y Podman corriendo en modo
 *   rootless en el host: no hay daemon root involucrado, y un escape del
 *   contenedor aterriza como un UID sin privilegios del host, nunca como root.
 *
 * Nota de diseño importante: Podman desacopla el ciclo de vida del
 * contenedor (vía `conmon`) del proceso `podman run` en sí. Matar el
 * proceso local del CLI NO garantiza que el contenedor se detenga si el
 * programa dentro sigue corriendo. Por eso el timeout y el límite de
 * salida hacen `podman stop --time 0 <nombre>` (SIGKILL inmediato al
 * contenedor) en vez de confiar solo en matar el proceso hijo de Node.
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
   * Ejecuta código Python o JavaScript dentro de un contenedor aislado.
   */
  async executeCode(
    code: string,
    language: SupportedLanguage,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { timeout = 10000, maxMemory = '128m', input = '' } = options;

    try {
      if (language !== 'python' && language !== 'javascript') {
        throw new Error(`Lenguaje no soportado: ${language}`);
      }

      const preparedCode = language === 'javascript' ? this.injectPromptPolyfill(code) : code;
      return await this.runSandboxed(preparedCode, language, timeout, maxMemory, input);
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
   * Arma los argumentos de `podman run` con todos los flags de hardening.
   * Cada flag cierra una superficie de ataque puntual:
   * --network=none      -> sin exfiltración de datos ni acceso a red interna
   * --memory/--cpus      -> sin agotamiento de recursos del host (DoS)
   * --pids-limit         -> sin fork bombs
   * --read-only + tmpfs  -> sin persistencia ni escritura fuera de /tmp
   * --cap-drop=ALL        -> sin capabilities de Linux (no puede, por ej., abrir sockets raw)
   * --security-opt no-new-privileges -> no puede escalar privilegios vía setuid binaries
   */
  private buildPodmanArgs(
    containerName: string,
    image: string,
    hostFile: string,
    containerFile: string,
    command: string[],
    maxMemory: string
  ): string[] {
    return [
      'run',
      '--rm',
      '--name', containerName,
      '--network=none',
      `--memory=${maxMemory}`,
      `--memory-swap=${maxMemory}`,
      '--cpus=0.5',
      '--pids-limit=64',
      '--read-only',
      '--tmpfs=/tmp:rw,size=16m',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '-v', `${hostFile}:${containerFile}:ro`,
      '-i',
      image,
      ...command,
    ];
  }

  /**
   * Detiene un contenedor de forma forzada e inmediata (SIGKILL, sin esperar
   * el grace period de SIGTERM). Se usa ante timeout o exceso de salida:
   * en ambos casos ya asumimos que el proceso es sospechoso o descontrolado,
   * así que no tiene sentido esperar a que termine solo.
   * Los errores se ignoran: el contenedor puede ya haber salido solo.
   */
  private async forceStopContainer(containerName: string): Promise<void> {
    try {
      await execAsync(`podman stop --time 0 ${containerName}`, { timeout: 5000 });
    } catch {
      // No es un error real para nosotros: ya no existía o ya se detuvo.
    }
  }

  /**
   * Ejecuta código dentro de un contenedor Podman efímero y aislado.
   */
  private async runSandboxed(
    code: string,
    language: SupportedLanguage,
    timeout: number,
    maxMemory: string,
    input: string = ''
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const extension = language === 'python' ? '.py' : '.js';
    const tempFile = await this.createTempFile(code, extension);
    const containerFile = CONTAINER_SCRIPT_PATH[language];
    const image = SANDBOX_IMAGES[language];
    const runtimeCommand = language === 'python' ? ['python', containerFile] : ['node', containerFile];
    const containerName = `exam-exec-${randomBytes(8).toString('hex')}`;

    const args = this.buildPodmanArgs(containerName, image, tempFile, containerFile, runtimeCommand, maxMemory);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimeout = false;
      let outputExceeded = false;
      let settled = false;

      const podmanProcess = spawn('podman', args, { windowsHide: true });

      const timeoutId = setTimeout(() => {
        isTimeout = true;
        void this.forceStopContainer(containerName);
        podmanProcess.kill('SIGKILL');
      }, timeout);

      const finish = async (result: ExecutionResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        await this.cleanupTempFile(tempFile);
        resolve(result);
      };

      podmanProcess.stdout.on('data', (data) => {
        if (outputExceeded) return;
        stdout += data.toString();
        if (stdout.length > MAX_OUTPUT_BYTES) {
          outputExceeded = true;
          void this.forceStopContainer(containerName);
          podmanProcess.kill('SIGKILL');
        }
      });

      podmanProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Enviar input si existe (idéntico al comportamiento previo con spawn directo)
      try {
        if (input) {
          const inputWithNewline = input.endsWith('\n') ? input : input + '\n';
          podmanProcess.stdin.write(inputWithNewline);
        }
        podmanProcess.stdin.end();
      } catch {
        // Si el proceso ya murió, escribir a su stdin puede tirar EPIPE;
        // el manejo de 'close'/'error' de abajo se encarga del resultado final.
      }

      podmanProcess.on('close', (exitCode) => {
        const executionTime = Date.now() - startTime;

        if (isTimeout) {
          void finish({
            output: stdout,
            error: `Tiempo de ejecución excedido (máximo ${timeout}ms)`,
            exitCode: 124,
            executionTime
          });
        } else if (outputExceeded) {
          void finish({
            output: stdout.slice(0, MAX_OUTPUT_BYTES),
            error: `Salida excedida (máximo ${MAX_OUTPUT_BYTES} bytes)`,
            exitCode: 1,
            executionTime
          });
        } else {
          void finish({
            output: stdout || '',
            error: stderr || null,
            exitCode: exitCode ?? 0,
            executionTime
          });
        }
      });

      podmanProcess.on('error', (error) => {
        const executionTime = Date.now() - startTime;
        void finish({
          output: '',
          error: `No se pudo iniciar el contenedor: ${error.message}`,
          exitCode: 1,
          executionTime
        });
      });
    });
  }

  /**
   * Inyecta un polyfill de prompt() para Node.js que usa readline
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
   * Valida la sintaxis del código sin ejecutarlo.
   *
   * A diferencia de executeCode, esto corre directo en el host (sin
   * contenedor): py_compile.compile() y `node --check` solo parsean/compilan
   * a bytecode, nunca ejecutan el código de nivel superior del usuario, así
   * que no hay superficie de ataque real que aislar acá.
   */
  async validateSyntax(code: string, language: 'python' | 'javascript'): Promise<ValidationResult> {
    try {
      if (language === 'python') {
        return await this.validatePythonSyntax(code);
      } else if (language === 'javascript') {
        return await this.validateJavaScriptSyntax(code);
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
   * Ejecuta tests contra código dado
   * Usado por el profesor para validar tests antes de publicar
   */
  async runTests(
    code: string,
    language: 'python' | 'javascript',
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

        const actualOutput = result.output.trim();
        const expectedOutput = testCase.expectedOutput.trim();
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
