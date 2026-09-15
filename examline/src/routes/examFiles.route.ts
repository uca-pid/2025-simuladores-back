import { type PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  validateExamOwnership,
  getStudentFiles,
  validateStudentInscription,
  getFiles,
  getFile,
  saveFile,
  deleteFile,
  saveSubmissionFiles,
  validateExamOwnerForReferenceSolution,
  getReferenceSolutionFiles,
  saveReferenceSolutionFiles,
  deleteReferenceSolutionFile
} from '../services/examFiles.service';

const ExamFilesRoute = (prisma: PrismaClient) => {
  const router = Router();

  // 🔒 Ruta para profesores: Ver archivos de un estudiante específico
  router.get('/:examId/student/:studentId/files', authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const { examId, studentId } = req.params;
      const profesorId = req.user!.userId;
      const version = req.query.version || 'submission'; // Por defecto, ver versión de envío

      // ✅ Verificar que el examen pertenece al profesor
      const ownership = await validateExamOwnership(prisma, parseInt(examId), profesorId);
      if (ownership.error) {
        const { status, error: message, code } = ownership.error as any;
        return res.status(status).json(code ? { error: message, code } : { error: message });
      }

      // Obtener archivos del estudiante
      const files = await getStudentFiles(prisma, parseInt(examId), parseInt(studentId), version as string);

      res.json(files);
    } catch (error) {
      console.error('Error fetching student files:', error);
      res.status(500).json({ error: 'Error obteniendo archivos del estudiante' });
    }
  });

// Obtener todos los archivos de un examen para un estudiante
router.get('/:examId/files', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.rol;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito en una ventana activa de este examen
    const validationError = await validateStudentInscription(prisma, userId, userRole, parseInt(examId));
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.error });
    }

    const files = await getFiles(prisma, parseInt(examId), userId, version as string);

    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Error obteniendo archivos' });
  }
});

// Obtener un archivo específico
router.get('/:examId/files/:filename', authenticateToken, async (req, res) => {
  try {
    const { examId, filename } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.rol;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
    const validationError = await validateStudentInscription(prisma, userId, userRole, parseInt(examId));
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.error });
    }

    const file = await getFile(prisma, parseInt(examId), userId, filename, version as string);

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.json(file);
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ error: 'Error obteniendo archivo' });
  }
});

// Crear o actualizar un archivo
router.post('/:examId/files', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const { filename, content, version = 'manual' } = req.body; // Agregar version con default 'manual'
    const userId = req.user!.userId;
    const userRole = req.user!.rol;

    if (!filename) {
      return res.status(400).json({ error: 'Nombre de archivo requerido' });
    }

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
    const validationError = await validateStudentInscription(prisma, userId, userRole, parseInt(examId));
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.error });
    }

    // Usar upsert para crear o actualizar en una sola operación
    // Esto evita problemas de condición de carrera
    const file = await saveFile(prisma, parseInt(examId), userId, filename, content, version);

    res.json(file);
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: 'Error guardando archivo' });
  }
});

// Eliminar un archivo
router.delete('/:examId/files/:filename', authenticateToken, async (req, res) => {
  try {
    const { examId, filename } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.rol;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
    const validationError = await validateStudentInscription(prisma, userId, userRole, parseInt(examId));
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.error });
    }

    const file = await deleteFile(prisma, parseInt(examId), userId, filename, version as string);

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.json({ message: 'Archivo eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Error eliminando archivo' });
  }
});

// Nuevo endpoint: Guardar múltiples archivos como versión de envío (submission)
router.post('/:examId/files/submission', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const { files } = req.body; // Array de { filename, content }
    const userId = req.user!.userId;
    const userRole = req.user!.rol;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Se requiere un array de archivos' });
    }

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
    const validationError = await validateStudentInscription(prisma, userId, userRole, parseInt(examId));
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.error });
    }

    // Crear/actualizar todos los archivos con versión "submission"
    const savedFiles = await saveSubmissionFiles(prisma, parseInt(examId), userId, files);

    res.json({
      message: 'Archivos guardados como versión de envío',
      files: savedFiles
    });
  } catch (error) {
    console.error('Error saving submission files:', error);
    res.status(500).json({ error: 'Error guardando archivos de envío' });
  }
});

// Endpoints para solución de referencia (solo profesores)

// Obtener archivos de solución de referencia de un examen
router.get('/:examId/reference-solution', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user!.userId;

    // Verificar que el examen existe y el usuario es el profesor
    const ownership = await validateExamOwnerForReferenceSolution(prisma, parseInt(examId), userId, 'ver');
    if (ownership.error) {
      return res.status(ownership.error.status).json({ error: ownership.error.error });
    }

    const files = await getReferenceSolutionFiles(prisma, parseInt(examId), ownership.exam!.profesorId);

    res.json(files);
  } catch (error) {
    console.error('Error fetching reference solution files:', error);
    res.status(500).json({ error: 'Error obteniendo archivos de referencia' });
  }
});

// Guardar/actualizar archivos de solución de referencia
router.post('/:examId/reference-solution', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const { files } = req.body; // Array de { filename, content }
    const userId = req.user!.userId;

    // Verificar que el examen existe y el usuario es el profesor
    const ownership = await validateExamOwnerForReferenceSolution(prisma, parseInt(examId), userId, 'modificar');
    if (ownership.error) {
      return res.status(ownership.error.status).json({ error: ownership.error.error });
    }

    const exam = ownership.exam!;

    if (exam.tipo !== 'programming') {
      return res.status(400).json({ error: 'Solo los exámenes de programación pueden tener solución de referencia' });
    }

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Se requiere un array de archivos' });
    }

    // Crear/actualizar todos los archivos con versión "reference_solution"
    const savedFiles = await saveReferenceSolutionFiles(prisma, parseInt(examId), exam.profesorId, files);

    res.json({
      message: 'Archivos de solución de referencia guardados correctamente',
      files: savedFiles
    });
  } catch (error) {
    console.error('Error saving reference solution files:', error);
    res.status(500).json({ error: 'Error guardando archivos de referencia' });
  }
});

// Eliminar un archivo de solución de referencia
router.delete('/:examId/reference-solution/:filename', authenticateToken, async (req, res) => {
  try {
    const { examId, filename } = req.params;
    const userId = req.user!.userId;

    // Verificar que el examen existe y el usuario es el profesor
    const ownership = await validateExamOwnerForReferenceSolution(prisma, parseInt(examId), userId, 'eliminar');
    if (ownership.error) {
      return res.status(ownership.error.status).json({ error: ownership.error.error });
    }

    const file = await deleteReferenceSolutionFile(prisma, parseInt(examId), ownership.exam!.profesorId, filename);

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.json({ message: 'Archivo de referencia eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting reference solution file:', error);
    res.status(500).json({ error: 'Error eliminando archivo de referencia' });
  }
});

  return router;
};

export default ExamFilesRoute;
