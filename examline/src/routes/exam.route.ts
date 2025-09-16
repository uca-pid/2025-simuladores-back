import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";

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

  // GET /exams/:examId → trae examen y registra historial automáticamente para estudiantes
  router.get("/:examId", authenticateToken, async (req, res) => {
    const examId = parseInt(req.params.examId);

    if (isNaN(examId)) return res.status(400).json({ error: "examId inválido" });

    try {
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
