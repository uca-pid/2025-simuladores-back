import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth';
import CodeExecutionService from '../services/codeExecution.service.ts';

const CodeExecutionRoute = (prisma: PrismaClient) => {
  const router = Router();
  const codeExecutionService = new CodeExecutionService();

  /**
   * POST /code-execution/run
   * Ejecuta código de programación
   * Body: { code: string, language: 'python' | 'javascript', examId: number, input?: string }
   */
  router.post('/run', authenticateToken, async (req, res) => {
    try {
      const { code, language, examId, input } = req.body;
      const userId = req.user!.userId;
      const userRole = req.user!.rol;

      // Validaciones
      if (!code || !language) {
        return res.status(400).json({
          error: 'Código y lenguaje son requeridos'
        });
      }

      if (!['python', 'javascript'].includes(language)) {
        return res.status(400).json({
          error: 'Lenguaje no soportado. Use "python" o "javascript"'
        });
      }

      // Validar examen y permisos
      if (examId) {
        const exam = await prisma.exam.findUnique({
          where: { id: parseInt(examId) }
        });

        if (!exam) {
          return res.status(404).json({ error: 'Examen no encontrado' });
        }

        if (exam.tipo !== 'programming') {
          return res.status(400).json({
            error: 'Este examen no es de tipo programación'
          });
        }

        // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
        if (userRole === 'student') {
          const inscription = await prisma.inscription.findFirst({
            where: {
              userId: userId,
              examWindow: {
                examId: parseInt(examId),
                activa: true
              },
              cancelledAt: null
            }
          });

          if (!inscription) {
            return res.status(403).json({ error: 'No estás inscrito en una ventana activa de este examen' });
          }
        }
      }

      // Ejecutar código
      const result = await codeExecutionService.executeCode(
        code,
        language,
        {
          timeout: 10000, // 10 segundos
          maxMemory: '128m',
          input: input || '', // Pasar el input del usuario
        }
      );

      return res.json({
        success: true,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
      });

    } catch (error: any) {
      console.error('Error ejecutando código:', error);
      return res.status(500).json({
        error: 'Error interno al ejecutar código',
        details: error.message
      });
    }
  });

  /**
   * POST /code-execution/validate
   * Valida sintaxis del código sin ejecutarlo
   */
  router.post('/validate', authenticateToken, async (req, res) => {
    try {
      const { code, language } = req.body;

      if (!code || !language) {
        return res.status(400).json({
          error: 'Código y lenguaje son requeridos'
        });
      }

      const result = await codeExecutionService.validateSyntax(code, language);

      return res.json({
        valid: result.valid,
        errors: result.errors
      });

    } catch (error: any) {
      console.error('Error validando código:', error);
      return res.status(500).json({
        error: 'Error interno al validar código',
        details: error.message
      });
    }
  });

  /**
   * POST /code-execution/execute
   * Ejecuta código con tests cases o input personalizado (para profesores)
   * Body: { 
   *   code: string, 
   *   language: 'python' | 'javascript', 
   *   filename?: string,
   *   testCases?: array,
   *   customInput?: string 
   * }
   */
  router.post('/execute', authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const { code, language, filename, testCases, customInput } = req.body;

      // Validaciones
      if (!code || !language) {
        return res.status(400).json({
          error: 'Código y lenguaje son requeridos'
        });
      }

      if (!['python', 'javascript'].includes(language)) {
        return res.status(400).json({
          error: 'Lenguaje no soportado. Use "python" o "javascript"'
        });
      }

      // Si hay input personalizado, ejecutar con ese input
      if (customInput !== undefined && customInput !== null) {
        const result = await codeExecutionService.executeCode(
          code,
          language,
          {
            timeout: 10000,
            maxMemory: '128m',
            input: customInput,
          }
        );

        return res.json({
          success: !result.error,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          executionTime: result.executionTime,
        });
      }

      // Si hay test cases, ejecutarlos
      if (testCases && Array.isArray(testCases) && testCases.length > 0) {
        const testResults: any[] = [];
        let passedTests = 0;

        for (const testCase of testCases) {
          try {
            const result = await codeExecutionService.executeCode(
              code,
              language,
              {
                timeout: 10000,
                maxMemory: '128m',
                input: testCase.input || '',
              }
            );

            const passed = result.output?.trim() === testCase.expectedOutput?.trim();
            if (passed) passedTests++;

            testResults.push({
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              actualOutput: result.output?.trim(),
              passed,
              error: result.error,
              executionTime: result.executionTime
            });
          } catch (err: any) {
            testResults.push({
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              passed: false,
              error: err.message || 'Error desconocido'
            });
          }
        }

        const score = (passedTests / testCases.length) * 100;

        return res.json({
          success: true,
          score,
          passedTests,
          totalTests: testCases.length,
          testResults
        });
      }

      // Si no hay ni input ni test cases, ejecutar sin input
      const result = await codeExecutionService.executeCode(
        code,
        language,
        {
          timeout: 10000,
          maxMemory: '128m',
          input: '',
        }
      );

      return res.json({
        success: !result.error,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
      });

    } catch (error: any) {
      console.error('Error ejecutando código:', error);
      return res.status(500).json({
        error: 'Error interno al ejecutar código',
        details: error.message
      });
    }
  });

  return router;
};

export default CodeExecutionRoute;
