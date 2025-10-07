import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const ExamRoute = (prisma: PrismaClient) => {
  const router = Router();

  // POST /exams/create (protected - professors only)
  router.post("/create", authenticateToken, requireRole(['professor']), async (req, res) => {
    const { titulo, preguntas } = req.body;

    try {
      const examen = await prisma.exam.create({
        data: {
          titulo,
          profesorId: req.user!.userId, // Use authenticated user's ID
          preguntas: {
            create: preguntas.map((p: any) => ({
              texto: p.texto,
              correcta: p.correcta,
              opciones: p.opciones,
            })),
          },
        },
        include: { preguntas: true },
      });

      res.status(201).json(examen);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "No se pudo crear el examen" });
    }
  });

  // GET /exams (protected - get exams for authenticated professor, or all exams if system admin)
  router.get("/", authenticateToken, async (req, res) => {
      try {
        let profesorId: number;
        
        if (req.user!.rol === 'professor') {
          // Professors can only see their own exams
          profesorId = req.user!.userId;
        } else if (req.user!.rol === 'system') {
          // System users can specify profesorId in query, or get all exams
          const queryProfesorId = req.query.profesorId;
          if (queryProfesorId) {
            profesorId = Number(queryProfesorId);
            if (isNaN(profesorId)) {
              return res.status(400).json({ error: "ProfesorId inválido" });
            }
          } else {
            // Get all exams for system users
            const exams = await prisma.exam.findMany({
              include: { preguntas: true, profesor: { select: { nombre: true, email: true } } },
            });
            return res.json(exams);
          }
        } else {
          return res.status(403).json({ error: "No tienes permisos para ver exámenes" });
        }
  
        const exams = await prisma.exam.findMany({
          where: { profesorId },
          include: { preguntas: true },
        });
  
        res.json(exams);
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
      // 🔒 VALIDACIÓN DE SEGURIDAD PARA ESTUDIANTES
      if (req.user!.rol === 'student') {
        // Requiere windowId para estudiantes
        if (!windowId) {
          return res.status(400).json({ 
            error: "Se requiere windowId para acceder al examen",
            code: "WINDOW_ID_REQUIRED" 
          });
        }

        // Verificar inscripción y permisos
        const inscription = await prisma.inscription.findFirst({
          where: {
            userId: req.user!.userId,
            examWindowId: windowId
          },
          include: {
            examWindow: {
              include: {
                exam: true
              }
            }
          }
        });

        if (!inscription) {
          return res.status(403).json({ 
            error: "No estás inscrito en esta ventana de examen",
            code: "NOT_ENROLLED" 
          });
        }

        // Verificar que el examen de la ventana coincida con el solicitado
        if (inscription.examWindow.exam.id !== examId) {
          return res.status(403).json({ 
            error: "La ventana no corresponde a este examen",
            code: "EXAM_MISMATCH" 
          });
        }

        // Verificar que esté habilitado
        if (!inscription.presente) {
          return res.status(403).json({ 
            error: "No estás habilitado para rendir este examen",
            code: "NOT_ENABLED" 
          });
        }

        // Verificar que la ventana esté activa
        if (!inscription.examWindow.activa) {
          return res.status(403).json({ 
            error: "Esta ventana de examen ha sido desactivada por el profesor",
            code: "WINDOW_DEACTIVATED"
          });
        }

        // Verificar disponibilidad del examen
        if (inscription.examWindow.sinTiempo) {
          // Para ventanas sin tiempo, solo verificar que esté en estado programada y activa
          if (inscription.examWindow.estado !== 'programada') {
            return res.status(403).json({ 
              error: "El examen no está disponible en este momento",
              code: "EXAM_NOT_AVAILABLE",
              estado: inscription.examWindow.estado
            });
          }
        } else {
          // Para ventanas con tiempo, verificar estado y tiempo
          const now = new Date();
          const startDate = new Date(inscription.examWindow.fechaInicio!);
          const endDate = new Date(startDate.getTime() + (inscription.examWindow.duracion! * 60 * 1000));

          if (inscription.examWindow.estado !== 'en_curso' || now < startDate || now > endDate) {
            return res.status(403).json({ 
              error: "El examen no está disponible en este momento",
              code: "EXAM_NOT_AVAILABLE",
              estado: inscription.examWindow.estado,
              fechaInicio: inscription.examWindow.fechaInicio,
              fechaFin: endDate
            });
          }
        }
      }

      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: { preguntas: true },
      });

      if (!exam) return res.status(404).json({ error: "Examen no encontrado" });

      // Auto-register history for students
      if (req.user!.rol === 'student') {
        await prisma.examHistory.upsert({
          where: { userId_examId: { userId: req.user!.userId, examId } },
          update: { viewedAt: new Date() },
          create: { userId: req.user!.userId, examId },
        });
      }

      res.json(exam);
    } catch (error) {
      console.error('Error fetching exam:', error);
      res.status(500).json({ error: "Error al obtener el examen" });
    }
  });

  // GET /exams/history/:userId → obtiene historial de exámenes (protected)
  router.get("/history/:userId", authenticateToken, async (req, res) => {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) return res.status(400).json({ error: "userId inválido" });

    // Users can only see their own history, professors can see any student's history
    if (req.user!.rol === 'student' && req.user!.userId !== targetUserId) {
      return res.status(403).json({ error: "No puedes ver el historial de otro usuario" });
    }

    try {
      const history = await prisma.examHistory.findMany({
        where: { userId: targetUserId },
        include: { exam: true },
        orderBy: { viewedAt: "desc" },
      });

      res.json(history);
    } catch (error) {
      console.error('Error fetching exam history:', error);
      res.status(500).json({ error: "Error al obtener historial" });
    }
  });

  return router;
};

export default ExamRoute;
