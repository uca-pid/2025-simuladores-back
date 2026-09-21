import { exec, spawn } from 'child_process';
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
  maxMemory?: string; // ej: '128m'
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
   * Ejecuta código Python o JavaScript
   * 
   * TODO: Migrar a Docker para mayor seguridad
   * Cuando se migre a Docker:
   * - Reemplazar execAsync con docker run
   * - Montar volumen con el archivo de código
   * - Usar imágenes de Python/Node.js oficiales
   */
  async executeCode(
    code: string,
    language: 'python' | 'javascript',
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { timeout = 10000, maxMemory = '128m', input = '' } = options;

    try {
      if (language === 'python') {
        return await this.executePython(code, timeout, input, options.datasets);
      } else if (language === 'javascript') {
        return await this.executeJavaScript(code, timeout, input, options.datasets);
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
   * Ejecuta código Python 3.11
   * 
   * Versión actual: Ejecución directa con python3
   * Versión futura (Docker):
   * docker run --rm -v ${tempFile}:/code.py -m ${maxMemory} python:3.11-alpine python /code.py
   */
  private async executePython(code: string, timeout: number, input: string = '', datasets?: DatasetFile[]): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { dir, codeFile } = await this.createExecutionDir(code, '.py', datasets);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimeout = false;

      // Usar spawn para mejor manejo de stdin. cwd = dir de ejecucion: asi
      // open("archivo.csv") (ruta relativa) encuentra el dataset dejado al lado del codigo.
      const pythonProcess = spawn('python', [codeFile], {
        windowsHide: true,
        cwd: dir,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      // Configurar timeout
      const timeoutId = setTimeout(() => {
        isTimeout = true;
        pythonProcess.kill('SIGTERM');
      }, timeout);

      // Capturar stdout
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Capturar stderr
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Enviar input si existe
      if (input) {
        // Asegurar que el input termine con nueva línea para que input() funcione correctamente
        const inputWithNewline = input.endsWith('\n') ? input : input + '\n';
        pythonProcess.stdin.write(inputWithNewline);
        pythonProcess.stdin.end();
      } else {
        pythonProcess.stdin.end();
      }

      // Manejar finalización
      pythonProcess.on('close', async (code) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        // Limpiar archivo temporal
        await this.cleanupExecutionDir(dir);

        if (isTimeout) {
          resolve({
            output: stdout || '',
            error: `Tiempo de ejecución excedido (máximo ${timeout}ms)`,
            exitCode: 124,
            executionTime
          });
        } else {
          resolve({
            output: stdout || '',
            error: stderr || null,
            exitCode: code || 0,
            executionTime
          });
        }
      });

      // Manejar errores del proceso
      pythonProcess.on('error', async (error) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;
        
        // Limpiar archivo temporal
        await this.cleanupExecutionDir(dir);

        resolve({
          output: '',
          error: error.message,
          exitCode: 1,
          executionTime
        });
      });
    });
  }

  /**
   * Ejecuta código JavaScript con Node.js
   * 
   * Versión actual: Ejecución directa con node
   * Versión futura (Docker):
   * docker run --rm -v ${tempFile}:/code.js -m ${maxMemory} node:18-alpine node /code.js
   */
  private async executeJavaScript(code: string, timeout: number, input: string = '', datasets?: DatasetFile[]): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Inyectar polyfill de prompt() para Node.js
    const codeWithPromptPolyfill = this.injectPromptPolyfill(code);
    const { dir, codeFile } = await this.createExecutionDir(codeWithPromptPolyfill, '.js', datasets);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimeout = false;

      // Usar spawn para mejor manejo de stdin. cwd = dir de ejecucion: asi
      // fs.readFileSync("archivo.csv") (ruta relativa) encuentra el dataset dejado al lado del codigo.
      const nodeProcess = spawn('node', [codeFile], {
        windowsHide: true,
        cwd: dir,
      });

      // Configurar timeout
      const timeoutId = setTimeout(() => {
        isTimeout = true;
        nodeProcess.kill('SIGTERM');
      }, timeout);

      // Capturar stdout
      nodeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Capturar stderr
      nodeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Enviar input si existe
      if (input) {
        // Asegurar que el input termine con nueva línea
        const inputWithNewline = input.endsWith('\n') ? input : input + '\n';
        nodeProcess.stdin.write(inputWithNewline);
        nodeProcess.stdin.end();
      } else {
        nodeProcess.stdin.end();
      }

      // Manejar finalización
      nodeProcess.on('close', async (code) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        // Limpiar archivo temporal
        await this.cleanupExecutionDir(dir);

        if (isTimeout) {
          resolve({
            output: stdout || '',
            error: `Tiempo de ejecución excedido (máximo ${timeout}ms)`,
            exitCode: 124,
            executionTime
          });
        } else {
          resolve({
            output: stdout || '',
            error: stderr || null,
            exitCode: code || 0,
            executionTime
          });
        }
      });

      // Manejar errores del proceso
      nodeProcess.on('error', async (error) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;
        
        // Limpiar archivo temporal
        await this.cleanupExecutionDir(dir);

        resolve({
          output: '',
          error: error.message,
          exitCode: 1,
          executionTime
        });
      });
    });
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
      await Promise.all(datasets.map(dataset =>
        writeFile(path.join(dir, dataset.name), dataset.content, 'utf-8')
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

  /**
   * Método futuro para ejecutar código en Docker
   * Descomentar cuando se implemente Docker
   */
  /*
  private async executeInDocker(
    code: string,
    language: 'python' | 'javascript',
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const tempFile = await this.createTempFile(
      code,
      language === 'python' ? '.py' : '.js'
    );

    const image = language === 'python' ? 'python:3.11-alpine' : 'node:18-alpine';
    const command = language === 'python' ? 'python /code' : 'node /code';
    
    const dockerCommand = `docker run --rm \
      --network none \
      --memory ${options.maxMemory} \
      --cpus 0.5 \
      -v ${tempFile}:/code:ro \
      ${image} \
      ${command}`;

    try {
      const { stdout, stderr } = await execAsync(dockerCommand, {
        timeout: options.timeout,
        maxBuffer: 1024 * 1024
      });

      const executionTime = Date.now() - startTime;

      return {
        output: stdout || '',
        error: stderr || null,
        exitCode: 0,
        executionTime
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      return {
        output: error.stdout || '',
        error: error.stderr || error.message,
        exitCode: error.code || 1,
        executionTime
      };

    } finally {
      await this.cleanupTempFile(tempFile);
    }
  }
  */
}

export default CodeExecutionService;
