import { type PrismaClient } from "@prisma/client";
import { Router } from "express";

const ExamRoute = (prisma: PrismaClient) => {
  const router = Router();

  // POST /exams/create
  router.post("/create", async (req, res) => {
    const { titulo, preguntas, profesorId } = req.body;

    try {
      const examen = await prisma.exam.create({
        data: {
          titulo,
          profesorId: Number(profesorId),
          preguntas: {
            create: preguntas.map((p) => ({
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

  // GET /exams?profesorId=...
  router.get("/", async (req, res) => {
    const profesorId = Number(req.query.profesorId);
    if (isNaN(profesorId))
      return res.status(400).json({ error: "ProfesorId inválido" });

    const exams = await prisma.exam.findMany({
      where: { profesorId },
      include: { preguntas: true },
    });

    res.json(exams);
  });

  // GET /exams/:examId?userId=... → trae examen y registra historial si userId
  router.get("/:examId", async (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

    if (isNaN(examId)) return res.status(400).json({ error: "examId inválido" });

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { preguntas: true },
    });

    if (!exam) return res.status(404).json({ error: "Examen no encontrado" });

    // Registrar historial si hay userId
    if (userId) {
      await prisma.examHistory.upsert({
        where: { userId_examId: { userId, examId } },
        update: { viewedAt: new Date() },
        create: { userId, examId },
      });
    }

    res.json(exam);
  });

  // GET /exams/history/:userId → obtiene historial de exámenes de un usuario
  router.get("/history/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "userId inválido" });

    const history = await prisma.examHistory.findMany({
      where: { userId },
      include: { exam: true },
      orderBy: { viewedAt: "desc" },
    });

    res.json(history);
  });

  return router;
};

export default ExamRoute;
