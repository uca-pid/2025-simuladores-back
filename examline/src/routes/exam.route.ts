import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole, requireOwnership } from "../middleware/auth.ts";
import CodeExecutionService from "../services/codeExecution.service.ts";
import {
  createExam,
  getExamsForUser,
  getExamById,
  testSolution,
  testSolutionPreview,
  saveReferenceSolution
} from "../services/exam.service.ts";

const ExamRoute = (prisma: PrismaClient) => {
  const router = Router();
  const codeExecutionService = new CodeExecutionService();

  // POST /exams/create (protected - professors only)
  router.post("/create", authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const result = await createExam(prisma, req.body, req.user!.userId);

      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.error });
      }

      res.status(201).json(result.exam);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "No se pudo crear el examen" });
    }
  });

  // GET /exams (protected - get exams for authenticated professor, or all exams if system admin)
  router.get("/", authenticateToken, async (req, res) => {
      try {
        const result = await getExamsForUser(prisma, req.user!.rol, req.user!.userId, req.query.profesorId);

        if (result.error) {
          return res.status(result.error.status).json({ error: result.error.error });
        }

        res.json(result.exams);
      } catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).json({ error: "Error al obtener exámenes" });
      }
    });

  // GET /exams/:examId → trae examen con validación de inscripción para estudiantes
  router.get("/:examId", authenticateToken, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const windowId = req.query.windowId ? parseInt(req.query.windowId as string) : null;

    if (isNaN(examId)) return res.status(400).json({ error: "examId inválido" });

    try {
      const result = await getExamById(prisma, examId, windowId, req.user!.rol, req.user!.userId);

      if (result.error) {
        const { status, error: message, code, ...rest } = result.error;
        return res.status(status).json(code ? { error: message, code, ...rest } : { error: message });
      }

      res.json(result.exam);
    } catch (error) {
      console.error('Error fetching exam:', error);
      res.status(500).json({ error: "Error al obtener el examen" });
    }
  });

  // POST /exams/:id/test-solution (protected - professors only)
  // Ejecuta tests contra código temporal o solución de referencia
  router.post("/:id/test-solution", authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const { code, useReferenceSolution } = req.body;

      if (isNaN(examId)) {
        return res.status(400).json({ error: "ID de examen inválido" });
      }

      const result = await testSolution(prisma, codeExecutionService, examId, req.user!.userId, code, useReferenceSolution);

      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.error });
      }

      return res.json({
        success: true,
        ...result.testResults
      });

    } catch (error: any) {
      console.error('Error ejecutando tests:', error);
      return res.status(500).json({
        error: 'Error interno al ejecutar tests',
        details: error.message
      });
    }
  });

  // POST /exams/test-solution-preview (protected - professors only)
  // Ejecuta tests contra código durante la creación del examen (sin examen guardado)
  router.post("/test-solution-preview", authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const { code, language, testCases } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Debe proporcionar código para ejecutar" });
      }

      if (!language || !['python', 'javascript'].includes(language)) {
        return res.status(400).json({ error: "Lenguaje no válido. Use 'python' o 'javascript'" });
      }

      if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar test cases" });
      }

      const testResults = await testSolutionPreview(codeExecutionService, code, language, testCases);

      return res.json({
        success: true,
        ...testResults
      });

    } catch (error: any) {
      console.error('Error ejecutando tests en preview:', error);
      return res.status(500).json({
        error: 'Error interno al ejecutar tests',
        details: error.message
      });
    }
  });

  // PUT /exams/:id/reference-solution (protected - professors only)
  // Guarda o actualiza la solución de referencia
  router.put("/:id/reference-solution", authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const { solucionReferencia } = req.body;

      if (isNaN(examId)) {
        return res.status(400).json({ error: "ID de examen inválido" });
      }

      const result = await saveReferenceSolution(prisma, examId, req.user!.userId, solucionReferencia);

      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.error });
      }

      return res.json({
        success: true,
        message: "Solución de referencia actualizada correctamente",
        exam: result.exam
      });

    } catch (error: any) {
      console.error('Error guardando solución de referencia:', error);
      return res.status(500).json({
        error: 'Error interno al guardar solución de referencia',
        details: error.message
      });
    }
  });

  return router;
};

export default ExamRoute;
