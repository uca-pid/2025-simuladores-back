import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import os from 'os';

const execAsync = promisify(exec);

interface ExecutionOptions {
  timeout?: number; // en milisegundos
  maxMemory?: string; // ej: '128m'
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
    const { timeout = 10000, maxMemory = '128m' } = options;

    try {
      if (language === 'python') {
        return await this.executePython(code, timeout);
      } else if (language === 'javascript') {
        return await this.executeJavaScript(code, timeout);
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
  private async executePython(code: string, timeout: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    const tempFile = await this.createTempFile(code, '.py');

    try {
      // Ejecutar Python con timeout
      const { stdout, stderr } = await execAsync(
        `python "${tempFile}"`,
        {
          timeout,
          maxBuffer: 1024 * 1024, // 1MB
          windowsHide: true,
        }
      );

      const executionTime = Date.now() - startTime;

      return {
        output: stdout || '',
        error: stderr || null,
        exitCode: 0,
        executionTime
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      // Detectar timeout
      if (error.killed && error.signal === 'SIGTERM') {
        return {
          output: '',
          error: `Tiempo de ejecución excedido (máximo ${timeout}ms)`,
          exitCode: 124,
          executionTime
        };
      }

      return {
        output: error.stdout || '',
        error: error.stderr || error.message,
        exitCode: error.code || 1,
        executionTime
      };

    } finally {
      // Limpiar archivo temporal
      await this.cleanupTempFile(tempFile);
    }
  }

  /**
   * Ejecuta código JavaScript con Node.js
   * 
   * Versión actual: Ejecución directa con node
   * Versión futura (Docker):
   * docker run --rm -v ${tempFile}:/code.js -m ${maxMemory} node:18-alpine node /code.js
   */
  private async executeJavaScript(code: string, timeout: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    const tempFile = await this.createTempFile(code, '.js');

    try {
      const { stdout, stderr } = await execAsync(
        `node "${tempFile}"`,
        {
          timeout,
          maxBuffer: 1024 * 1024, // 1MB
          windowsHide: true,
        }
      );

      const executionTime = Date.now() - startTime;

      return {
        output: stdout || '',
        error: stderr || null,
        exitCode: 0,
        executionTime
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      if (error.killed && error.signal === 'SIGTERM') {
        return {
          output: '',
          error: `Tiempo de ejecución excedido (máximo ${timeout}ms)`,
          exitCode: 124,
          executionTime
        };
      }

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
