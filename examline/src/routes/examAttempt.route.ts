import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";
import {
  validateAttemptStart,
  findOrCreateAttempt,
  prepareProgrammingFinishData,
  prepareMultipleChoiceFinishData,
  getExamFilesForResults,
  getExamFilesForProfessorView,
} from "../services/examAttempt.service.ts";

const ExamAttemptRoute = (prisma: PrismaClient) => {
  const router = Router();

  // POST /exam-attempts/start - Iniciar un intento de examen (students only)
  router.post("/start", authenticateToken, requireRole(['student']), async (req, res) => {
    const { examId, examWindowId } = req.body;
    const userId = req.user!.userId;

    try {
      // Verificar que el estudiante esté inscrito y habilitado
      if (examWindowId) {
        const validationError = await validateAttemptStart(prisma, userId, examWindowId);
        if (validationError) {
          return res.status(validationError.status).json({ error: validationError.error });
        }
      }

      const attempt = await findOrCreateAttempt(prisma, userId, examId, examWindowId);

      if (!attempt) {
        return res.status(404).json({ error: "Examen no encontrado" });
      }

      res.json(attempt);
    } catch (error) {
      console.error('Error starting exam attempt:', error);
      res.status(500).json({ error: "Error iniciando intento de examen" });
    }
  });

  // PUT /exam-attempts/:attemptId/save-code - Guardar código de programación
  router.put("/:attemptId/save-code", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;
    const { codigoProgramacion } = req.body;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      // Verificar que el intento pertenece al usuario
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: { exam: true }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      if (attempt.userId !== userId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      if (attempt.estado !== "en_progreso") {
        return res.status(400).json({ error: "El intento ya fue finalizado" });
      }

      // Verificar que es un examen de programación
      if (attempt.exam.tipo !== 'programming') {
        return res.status(400).json({ error: "Esta ruta es solo para exámenes de programación" });
      }

      // Guardar código
      const updatedAttempt = await prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          codigoProgramacion: codigoProgramacion
        }
      });

      res.json({ message: "Código guardado exitosamente", attempt: updatedAttempt });
    } catch (error) {
      console.error('Error saving code:', error);
      res.status(500).json({ error: "Error guardando código" });
    }
  });

  // PUT /exam-attempts/:attemptId/finish - Finalizar intento
  router.put("/:attemptId/finish", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;
    const { respuestas, codigoProgramacion } = req.body;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      // Verificar que el intento pertenece al usuario
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: { exam: true }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      if (attempt.userId !== userId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      if (attempt.estado !== "en_progreso") {
        return res.status(400).json({ error: "El intento ya fue finalizado" });
      }

      // Preparar datos de actualización
      const updateData: any = {
        finishedAt: new Date(),
        estado: "finalizado"
      };

      // Agregar datos específicos según el tipo de examen
      if (attempt.exam.tipo === 'programming') {
        const result = await prepareProgrammingFinishData(prisma, {
          examId: attempt.examId,
          userId
        });

        if (result.error) {
          return res.status(result.error.status).json({ error: result.error.error });
        }

        Object.assign(updateData, result.updateData);
      } else if (attempt.exam.tipo === 'multiple_choice') {
        const mcData = await prepareMultipleChoiceFinishData(prisma, attemptId, attempt.examId, respuestas);
        Object.assign(updateData, mcData);
      }

      // Finalizar intento
      const updatedAttempt = await prisma.examAttempt.update({
        where: { id: attemptId },
        data: updateData
      });

      res.json(updatedAttempt);
    } catch (error) {
      console.error('Error finishing exam attempt:', error);
      res.status(500).json({ error: "Error finalizando intento de examen" });
    }
  });

  // GET /exam-attempts/check/:examId - Verificar si existe intento para un examen
  router.get("/check/:examId", authenticateToken, requireRole(['student']), async (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.user!.userId;
    const { windowId } = req.query;

    if (isNaN(examId)) {
      return res.status(400).json({ error: "ID de examen inválido" });
    }

    try {
      const examWindowId = windowId ? parseInt(windowId as string) : null;

      // Construir where clause manejando null correctamente
      const whereClause: any = {
        userId,
        examId
      };

      // Solo agregar examWindowId si no es null
      if (examWindowId !== null) {
        whereClause.examWindowId = examWindowId;
      } else {
        whereClause.examWindowId = null;
      }

      const attempt = await prisma.examAttempt.findFirst({
        where: whereClause
      });

      res.json({ hasAttempt: !!attempt, attempt });
    } catch (error) {
      console.error('Error checking exam attempt:', error);
      res.status(500).json({ error: "Error verificando intento" });
    }
  });

  // GET /exam-attempts/my-attempts - Obtener todos los intentos del estudiante autenticado
  router.get("/my-attempts", authenticateToken, requireRole(['student']), async (req, res) => {
    const userId = req.user!.userId;

    try {
      const attempts = await prisma.examAttempt.findMany({
        where: {
          userId,
          estado: "finalizado" // Solo intentos finalizados para estadísticas
        },
        include: {
          exam: {
            select: {
              id: true,
              titulo: true,
              tipo: true
            }
          },
          examWindow: {
            select: {
              id: true,
              fechaInicio: true
            }
          }
        },
        orderBy: {
          finishedAt: 'desc'
        }
      });

      res.json(attempts);
    } catch (error) {
      console.error('Error fetching student attempts:', error);
      res.status(500).json({ error: "Error obteniendo intentos del estudiante" });
    }
  });

  // GET /exam-attempts/:attemptId/results - Ver resultados con respuestas correctas (solo intentos finalizados)
  router.get("/:attemptId/results", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: {
            include: { preguntas: true }
          },
          examWindow: true,
          respuestas: true // Incluir respuestas del nuevo modelo
        }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      // Solo el propietario del intento puede verlo
      if (attempt.userId !== userId) {
        return res.status(403).json({ error: "No autorizado para ver este intento" });
      }

      // Solo intentos finalizados pueden mostrar resultados
      if (attempt.estado !== "finalizado") {
        return res.status(403).json({ error: "El intento debe estar finalizado para ver resultados" });
      }

      // Convertir respuestas a formato legacy { preguntaId: valor }
      const respuestasLegacy: any = {};
      attempt.respuestas.forEach((resp) => {
        respuestasLegacy[resp.preguntaId] = resp.valor;
      });

      // Si es un examen de programación, incluir archivos guardados
      let examFiles: any[] = [];
      if (attempt.exam.tipo === 'programming') {
        examFiles = await getExamFilesForResults(prisma, attempt.examId, userId);
      }

      // Agregar archivos al resultado
      const result = {
        ...attempt,
        respuestas: respuestasLegacy, // Usar formato legacy para compatibilidad con frontend
        examFiles: examFiles
      };

      res.json(result);
    } catch (error) {
      console.error('Error fetching attempt results:', error);
      res.status(500).json({ error: "Error obteniendo resultados del intento" });
    }
  });

  // GET /exam-attempts/window/:windowId - Obtener todos los intentos de una ventana (solo profesores)
  router.get("/window/:windowId", authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.windowId);
    const professorId = req.user!.userId;

    if (isNaN(windowId)) {
      return res.status(400).json({ error: "ID de ventana inválido" });
    }

    try {
      // Verificar que el profesor es dueño de esta ventana
      const examWindow = await prisma.examWindow.findUnique({
        where: { id: windowId },
        include: {
          exam: {
            select: {
              id: true,
              titulo: true,
              tipo: true,
              profesorId: true
            }
          }
        }
      });

      if (!examWindow) {
        return res.status(404).json({ error: "Ventana no encontrada" });
      }

      if (examWindow.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado para ver estos intentos" });
      }

      // Obtener todos los intentos finalizados de esta ventana
      const attempts = await prisma.examAttempt.findMany({
        where: {
          examWindowId: windowId,
          estado: "finalizado"
        },
        include: {
          user: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          },
          exam: {
            select: {
              id: true,
              titulo: true,
              tipo: true,
              lenguajeProgramacion: true
            }
          }
        },
        orderBy: [
          { finishedAt: 'desc' }
        ]
      });

      res.json(attempts);
    } catch (error) {
      console.error('Error fetching window attempts:', error);
      res.status(500).json({ error: "Error obteniendo intentos de la ventana" });
    }
  });

  // GET /exam-attempts/:attemptId/professor-view - Ver detalle de un intento (solo profesores)
  router.get("/:attemptId/professor-view", authenticateToken, requireRole(['professor']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const professorId = req.user!.userId;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: {
            include: {
              preguntas: true
            }
          },
          examWindow: true,
          user: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          }
        }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      // Verificar que el profesor es dueño del examen
      if (attempt.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado para ver este intento" });
      }

      // Si es un examen de programación, incluir archivos guardados (ambas versiones)
      let manualFiles: any[] = [];
      let submissionFiles: any[] = [];

      if (attempt.exam.tipo === 'programming') {
        const files = await getExamFilesForProfessorView(prisma, attempt.examId, attempt.userId);
        manualFiles = files.manualFiles;
        submissionFiles = files.submissionFiles;
      }

      // Agregar archivos al resultado
      const result = {
        ...attempt,
        manualFiles,
        submissionFiles
      };

      res.json(result);
    } catch (error) {
      console.error('Error fetching attempt for professor:', error);
      res.status(500).json({ error: "Error obteniendo intento" });
    }
  });

  // PUT /exam-attempts/:attemptId/manual-grade - Asignar calificación manual (solo profesores)
  router.put("/:attemptId/manual-grade", authenticateToken, requireRole(['professor']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const professorId = req.user!.userId;
    const { calificacionManual, comentariosCorreccion } = req.body;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    if (calificacionManual === undefined || calificacionManual === null) {
      return res.status(400).json({ error: "Calificación manual requerida" });
    }

    try {
      // Verificar que el intento existe y el profesor es dueño del examen
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: {
            select: {
              profesorId: true
            }
          }
        }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      if (attempt.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado para calificar este intento" });
      }

      // Actualizar calificación manual
      const updatedAttempt = await prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          calificacionManual: parseFloat(calificacionManual),
          comentariosCorreccion: comentariosCorreccion || null,
          corregidoPor: professorId,
          corregidoAt: new Date()
        }
      });

      res.json(updatedAttempt);
    } catch (error) {
      console.error('Error updating manual grade:', error);
      res.status(500).json({ error: "Error actualizando calificación manual" });
    }
  });

  // POST /:attemptId/extend-time - Agregar tiempo extra a un intento individual
  router.post('/:attemptId/extend-time', authenticateToken, requireRole(['professor']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const professorId = req.user!.userId;
    const rawMinutos = req.body.minutos !== undefined ? req.body.minutos : req.body.minutosExtras;
    const minutos = typeof rawMinutos === 'number' ? rawMinutos : parseInt(rawMinutos, 10);
    const motivo = req.body.motivo;

    if (isNaN(attemptId) || isNaN(minutos) || minutos <= 0) {
      return res.status(400).json({ error: "Parámetros inválidos. Se requieren minutos mayores a 0." });
    }

    try {
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: { exam: { select: { profesorId: true } } }
      });

      if (!attempt || !attempt.examWindowId) {
        return res.status(404).json({ error: "Intento no encontrado o no pertenece a una ventana" });
      }

      if (attempt.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      const { ExamTimeExtensionService } = await import('../services/examTimeExtension.service.ts');
      const timeExtensionService = new ExamTimeExtensionService(prisma);
      
      const extension = await timeExtensionService.grantIndividualExtension({
        examWindowId: attempt.examWindowId,
        attemptId: attemptId,
        minutos,
        otorgadoPor: professorId,
        motivo
      });

      res.json({ message: "Tiempo extendido correctamente para el estudiante", extension });
    } catch (error) {
      console.error('Error extendiendo tiempo individual:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};

export default ExamAttemptRoute;
