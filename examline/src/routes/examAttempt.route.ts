import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const ExamAttemptRoute = (prisma: PrismaClient) => {
  const router = Router();

  // POST /exam-attempts/start - Iniciar un intento de examen (students only)
  router.post("/start", authenticateToken, requireRole(['student']), async (req, res) => {
    const { examId, examWindowId } = req.body;
    const userId = req.user!.userId;

    try {
      // Verificar que el estudiante esté inscrito y habilitado
      if (examWindowId) {
        const inscription = await prisma.inscription.findUnique({
          where: {
            userId_examWindowId: { userId, examWindowId }
          },
          include: {
            examWindow: true
          }
        });

        if (!inscription) {
          return res.status(403).json({ error: "No estás inscrito en esta ventana" });
        }

        // Solo verificar presente si la ventana requiere presentismo
        // Ser defensivo: si requierePresente es null/undefined, asumir false (acceso libre)
        const requierePresente = inscription.examWindow.requierePresente === true;
        if (requierePresente && !inscription.presente) {
          return res.status(403).json({ error: "No estás habilitado para este examen" });
        }

        // Verificar que la ventana esté activa
        if (!inscription.examWindow.activa) {
          return res.status(403).json({ error: "Esta ventana de examen ha sido desactivada por el profesor" });
        }

        // Verificar disponibilidad del examen
        if (inscription.examWindow.sinTiempo) {
          // Para ventanas sin tiempo, solo verificar que esté activa
          if (inscription.examWindow.estado !== 'programada') {
            return res.status(403).json({ error: "El examen no está disponible" });
          }
        } else {
          // Para ventanas con tiempo, verificar tiempo y estado
          const now = new Date();
          const startDate = new Date(inscription.examWindow.fechaInicio!);
          const endDate = new Date(startDate.getTime() + (inscription.examWindow.duracion! * 60 * 1000));

          if (inscription.examWindow.estado !== 'en_curso' || now < startDate || now > endDate) {
            return res.status(403).json({ error: "El examen no está disponible" });
          }
        }
      }

      // Verificar si ya existe un intento
      const existingAttempt = await prisma.examAttempt.findUnique({
        where: {
          userId_examId_examWindowId: {
            userId,
            examId,
            examWindowId: examWindowId || null
          }
        }
      });

      if (existingAttempt) {
        return res.json(existingAttempt);
      }

      // Crear nuevo intento
      const attempt = await prisma.examAttempt.create({
        data: {
          userId,
          examId,
          examWindowId: examWindowId || null,
          respuestas: {},
          estado: "en_progreso"
        }
      });

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
        updateData.codigoProgramacion = codigoProgramacion;
      } else if (attempt.exam.tipo === 'multiple_choice') {
        updateData.respuestas = respuestas || {};
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
      
      const attempt = await prisma.examAttempt.findFirst({
        where: {
          userId,
          examId,
          examWindowId
        }
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
          examWindow: true
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

      // Si es un examen de programación, incluir archivos guardados
      let examFiles: any[] = [];
      if (attempt.exam.tipo === 'programming') {
        examFiles = await prisma.examFile.findMany({
          where: {
            examId: attempt.examId,
            userId: userId
          },
          select: {
            id: true,
            filename: true,
            content: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: {
            updatedAt: 'desc'
          }
        });
      }

      // Agregar archivos al resultado
      const result = {
        ...attempt,
        examFiles: examFiles
      };

      res.json(result);
    } catch (error) {
      console.error('Error fetching attempt results:', error);
      res.status(500).json({ error: "Error obteniendo resultados del intento" });
    }
  });

  return router;
};

export default ExamAttemptRoute;