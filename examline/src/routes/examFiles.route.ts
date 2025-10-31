import { type PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';

const ExamFilesRoute = (prisma: PrismaClient) => {
  const router = Router();



// Obtener todos los archivos de un examen para un estudiante
router.get('/:examId/files', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user.userId;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    const files = await prisma.examFile.findMany({
      where: {
        examId: parseInt(examId),
        userId: userId,
        version: version as string
      },
      select: {
        id: true,
        filename: true,
        content: true,
        version: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

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
    const userId = req.user.userId;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    const file = await prisma.examFile.findFirst({
      where: {
        examId: parseInt(examId),
        userId: userId,
        filename: filename,
        version: version as string
      }
    });

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
    const userId = req.user.userId;

    if (!filename) {
      return res.status(400).json({ error: 'Nombre de archivo requerido' });
    }

    // Verificar si ya existe el archivo con esa versión
    const existingFile = await prisma.examFile.findFirst({
      where: {
        examId: parseInt(examId),
        userId: userId,
        filename: filename,
        version: version
      }
    });

    let file;
    if (existingFile) {
      // Actualizar archivo existente
      file = await prisma.examFile.update({
        where: { id: existingFile.id },
        data: { content: content || '' }
      });
    } else {
      // Crear nuevo archivo
      file = await prisma.examFile.create({
        data: {
          examId: parseInt(examId),
          userId: userId,
          filename: filename,
          content: content || '',
          version: version
        }
      });
    }

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
    const userId = req.user.userId;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    const file = await prisma.examFile.findFirst({
      where: {
        examId: parseInt(examId),
        userId: userId,
        filename: filename,
        version: version as string
      }
    });

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    await prisma.examFile.delete({
      where: { id: file.id }
    });

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
    const userId = req.user.userId;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Se requiere un array de archivos' });
    }

    // Crear/actualizar todos los archivos con versión "submission"
    const savedFiles = [];
    for (const fileData of files) {
      const { filename, content } = fileData;
      
      if (!filename) {
        continue; // Saltar archivos sin nombre
      }

      // Verificar si ya existe el archivo con versión submission
      const existingFile = await prisma.examFile.findFirst({
        where: {
          examId: parseInt(examId),
          userId: userId,
          filename: filename,
          version: 'submission'
        }
      });

      let file;
      if (existingFile) {
        // Actualizar archivo existente
        file = await prisma.examFile.update({
          where: { id: existingFile.id },
          data: { content: content || '' }
        });
      } else {
        // Crear nuevo archivo
        file = await prisma.examFile.create({
          data: {
            examId: parseInt(examId),
            userId: userId,
            filename: filename,
            content: content || '',
            version: 'submission'
          }
        });
      }

      savedFiles.push(file);
    }

    res.json({ 
      message: 'Archivos guardados como versión de envío',
      files: savedFiles 
    });
  } catch (error) {
    console.error('Error saving submission files:', error);
    res.status(500).json({ error: 'Error guardando archivos de envío' });
  }
});

  return router;
};

export default ExamFilesRoute;