import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';
import CodeExecutionService from '../services/codeExecution.service.js';

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

      // Por ahora solo validamos que el examen existe si se proporciona
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

  return router;
};

export default CodeExecutionRoute;
