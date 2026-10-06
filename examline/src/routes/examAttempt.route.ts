import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { authenticateToken, requireRole } from "../middleware/auth.ts";
import {
  validateAttemptStart,
  findOrCreateAttempt,
  prepareProgrammingFinishData,
  prepareMultipleChoiceFinishData,
  getExamFilesForResults,
  getExamFilesForProfessorView,
  advancePart,
  continueToNextPart,
} from "../services/examAttempt.service.ts";

const ALLOWED_ANSWER_FILE_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const answerFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ANSWER_FILE_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos PDF, JPEG, PNG o WEBP"));
    }
  }
});

const uploadAnswerFileToCloudinary = (buffer: Buffer, publicId: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "raw", folder: "student-answer-files", public_id: publicId },
      (err, result) => {
        if (err || !result) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

const ExamAttemptRoute = (prisma: PrismaClient) => {
  const router = Router();

  // POST /exam-attempts/upload-answer-file (protected - students only)
  // Sube el archivo que un alumno adjunta como respuesta a una pregunta tipo "file_upload"
  router.post(
    "/upload-answer-file",
    authenticateToken,
    requireRole(['student']),
    (req, res) => {
      answerFileUpload.single("archivo")(req, res, async (err: any) => {
        if (err) {
          const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
            ? "El archivo supera el tamaño máximo permitido (10MB)"
            : err.message || "Error al subir el archivo";
          return res.status(400).json({ error: message });
        }

        if (!req.file) {
          return res.status(400).json({ error: "Debe adjuntar un archivo" });
        }

        try {
          const ext = ALLOWED_ANSWER_FILE_TYPES[req.file.mimetype];
          const publicId = `${req.user!.userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
          const url = await uploadAnswerFileToCloudinary(req.file.buffer, publicId);

          res.status(201).json({ url });
        } catch (uploadErr) {
          console.error('Error subiendo archivo de respuesta a Cloudinary:', uploadErr);
          res.status(500).json({ error: "Error al subir el archivo al storage" });
        }
      });
    }
  );

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
        include: { exam: { include: { partes: true } } }
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

      // Ruta legacy (mantenida por compatibilidad con exámenes de una sola parte,
      // que fueron creados/migrados con una única ExamPart). Los exámenes de
      // varias partes deben usar /advance-part y /continue-part.
      const primeraParte = attempt.exam.partes.find(p => p.orden === 1) || attempt.exam.partes[0];
      if (!primeraParte) {
        return res.status(400).json({ error: "El examen no tiene partes configuradas" });
      }

      // Preparar datos de actualización
      const updateData: any = {
        finishedAt: new Date(),
        estado: "finalizado"
      };

      // Agregar datos específicos según el tipo de la parte
      if (primeraParte.tipo === 'programming') {
        const result = await prepareProgrammingFinishData(prisma, {
          examId: attempt.examId,
          userId,
          partId: primeraParte.id
        });

        if (result.error) {
          return res.status(result.error.status).json({ error: result.error.error });
        }

        Object.assign(updateData, result.updateData);
      } else if (primeraParte.tipo === 'multiple_choice') {
        const mcData = await prepareMultipleChoiceFinishData(prisma, attemptId, primeraParte.id, respuestas);
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

  // POST /exam-attempts/:attemptId/advance-part - Cierra la parte en curso y avanza
  // (o finaliza el intento si era la última parte). El body lleva las respuestas
  // (multiple choice) de la parte en curso; para programación se usa el archivo
  // guardado vía /exam-files (igual que el flujo legacy de finish).
  router.post("/:attemptId/advance-part", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      const result = await advancePart(prisma, attemptId, userId, req.body || {});

      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.error });
      }

      res.json(result.attempt);
    } catch (error) {
      console.error('Error advancing exam part:', error);
      res.status(500).json({ error: "Error avanzando de parte" });
    }
  });

  // POST /exam-attempts/:attemptId/continue-part - Confirma el paso a la
  // siguiente parte tras el estado "esperando_continuar" dejado por advance-part.
  router.post("/:attemptId/continue-part", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      const result = await continueToNextPart(prisma, attemptId, userId);

      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.error });
      }

      res.json(result.attempt);
    } catch (error) {
      console.error('Error continuing to next exam part:', error);
      res.status(500).json({ error: "Error continuando a la siguiente parte" });
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
            include: { partes: { include: { preguntas: true }, orderBy: { orden: 'asc' } } }
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

      // Si alguna parte es de programación, incluir archivos guardados
      let examFiles: any[] = [];
      if (attempt.exam.partes.some(p => p.tipo === 'programming')) {
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
              partes: { select: { lenguajeProgramacion: true }, orderBy: { orden: 'asc' } }
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
              partes: { include: { preguntas: true }, orderBy: { orden: 'asc' } }
            }
          },
          examWindow: true,
          user: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          },
          respuestas: { include: { pregunta: true } }
        }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      // Verificar que el profesor es dueño del examen
      if (attempt.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado para ver este intento" });
      }

      // Si alguna parte es de programación, incluir archivos guardados (ambas versiones)
      let manualFiles: any[] = [];
      let submissionFiles: any[] = [];

      if (attempt.exam.partes.some(p => p.tipo === 'programming')) {
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

  return router;
};

export default ExamAttemptRoute;
