import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
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

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "enunciados");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DATASETS_DIR = path.join(process.cwd(), "uploads", "datasets");
fs.mkdirSync(DATASETS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"
};

const enunciadoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_MIME_TYPES[file.mimetype];
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos PDF o DOCX"));
    }
  }
});

// El navegador puede reportar distintos mimetypes para .csv/.txt según el SO/Excel,
// por eso se valida por extensión del nombre original en vez de por mimetype.
const ALLOWED_DATASET_EXTENSION = /\.(csv|txt)$/i;

const datasetUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DATASETS_DIR),
    filename: (_req, file, cb) => {
      const ext = file.originalname.toLowerCase().endsWith('.txt') ? '.txt' : '.csv';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DATASET_EXTENSION.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos CSV o TXT"));
    }
  }
});

const ExamRoute = (prisma: PrismaClient) => {
  const router = Router();
  const codeExecutionService = new CodeExecutionService();

  // POST /exams/upload-enunciado (protected - professors only)
  // Sube un archivo PDF/DOCX con la consigna de un examen de programación
  router.post(
    "/upload-enunciado",
    authenticateToken,
    requireRole(['professor']),
    (req, res) => {
      enunciadoUpload.single("archivo")(req, res, (err: any) => {
        if (err) {
          const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
            ? "El archivo supera el tamaño máximo permitido (10MB)"
            : err.message || "Error al subir el archivo";
          return res.status(400).json({ error: message });
        }

        if (!req.file) {
          return res.status(400).json({ error: "Debe adjuntar un archivo" });
        }

        res.status(201).json({
          url: `/uploads/enunciados/${req.file.filename}`,
          nombre: req.file.originalname
        });
      });
    }
  );

  // POST /exams/upload-dataset (protected - professors only)
  // Sube un archivo CSV con datos que el código del alumno podrá abrir/leer
  // durante la ejecución (ej. open("archivo.csv")).
  router.post(
    "/upload-dataset",
    authenticateToken,
    requireRole(['professor']),
    (req, res) => {
      datasetUpload.single("archivo")(req, res, (err: any) => {
        if (err) {
          const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
            ? "El archivo supera el tamaño máximo permitido (5MB)"
            : err.message || "Error al subir el archivo";
          return res.status(400).json({ error: message });
        }

        if (!req.file) {
          return res.status(400).json({ error: "Debe adjuntar un archivo" });
        }

        res.status(201).json({
          url: `/uploads/datasets/${req.file.filename}`,
          nombre: req.file.originalname
        });
      });
    }
  );

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
