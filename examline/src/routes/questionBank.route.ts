import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();
const prisma = new PrismaClient();

// Obtener todas las preguntas del banco del profesor
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.rol !== "professor") {
      return res.status(403).json({ error: "Solo los profesores pueden acceder al banco de preguntas" });
    }

    const questions = await prisma.questionBank.findMany({
      where: { profesorId: userId },
      orderBy: { createdAt: "desc" }
    });

    res.json(questions);
  } catch (error) {
    console.error("Error al obtener preguntas del banco:", error);
    res.status(500).json({ error: "Error al obtener preguntas del banco" });
  }
});

// Crear una nueva pregunta en el banco
router.post("/", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.rol !== "professor") {
      return res.status(403).json({ error: "Solo los profesores pueden crear preguntas en el banco" });
    }

    const { tipo, dificultad, titulo, texto, opciones, correcta, correctas, tags } = req.body;
    // essay/file_upload no tienen respuesta correcta predefinida (corrección manual)
    const requiereCorrecta = !["essay", "file_upload", "multiple_response"].includes(tipo || "multiple_choice");

    if (!texto || !opciones || (requiereCorrecta && correcta === undefined)) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    const question = await prisma.questionBank.create({
      data: {
        profesorId: userId,
        tipo: tipo || "multiple_choice",
        dificultad: dificultad || "media",
        titulo: titulo || "Sin título",
        texto,
        opciones,
        correcta: requiereCorrecta ? correcta : null,
        correctas: tipo === "multiple_response" ? (correctas ?? null) : null,
        tags: tags || []
      }
    });

    res.status(201).json(question);
  } catch (error) {
    console.error("Error al crear pregunta en el banco:", error);
    res.status(500).json({ error: "Error al crear pregunta en el banco" });
  }
});

// Actualizar una pregunta del banco
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const questionId = parseInt(req.params.id);
    const { tipo, dificultad, titulo, texto, opciones, correcta, correctas, tags } = req.body;

    const question = await prisma.questionBank.findUnique({
      where: { id: questionId }
    });

    if (!question) {
      return res.status(404).json({ error: "Pregunta no encontrada" });
    }

    if (question.profesorId !== userId) {
      return res.status(403).json({ error: "No tienes permiso para editar esta pregunta" });
    }

    const tipoFinal = tipo || question.tipo;
    const requiereCorrecta = !["essay", "file_upload", "multiple_response"].includes(tipoFinal);

    const updatedQuestion = await prisma.questionBank.update({
      where: { id: questionId },
      data: {
        tipo: tipoFinal,
        dificultad: dificultad || question.dificultad,
        titulo: titulo || question.titulo,
        texto,
        opciones,
        correcta: requiereCorrecta ? correcta : null,
        correctas: tipoFinal === "multiple_response" ? (correctas ?? question.correctas) : null,
        tags: tags !== undefined ? tags : question.tags
      }
    });

    res.json(updatedQuestion);
  } catch (error) {
    console.error("Error al actualizar pregunta:", error);
    res.status(500).json({ error: "Error al actualizar pregunta" });
  }
});

// Eliminar una pregunta del banco
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const questionId = parseInt(req.params.id);

    const question = await prisma.questionBank.findUnique({
      where: { id: questionId }
    });

    if (!question) {
      return res.status(404).json({ error: "Pregunta no encontrada" });
    }

    if (question.profesorId !== userId) {
      return res.status(403).json({ error: "No tienes permiso para eliminar esta pregunta" });
    }

    await prisma.questionBank.delete({
      where: { id: questionId }
    });

    res.json({ message: "Pregunta eliminada exitosamente" });
  } catch (error) {
    console.error("Error al eliminar pregunta:", error);
    res.status(500).json({ error: "Error al eliminar pregunta" });
  }
});

export default router;
