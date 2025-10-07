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

    const files = await prisma.examFile.findMany({
      where: {
        examId: parseInt(examId),
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

    const file = await prisma.examFile.findFirst({
      where: {
        examId: parseInt(examId),
        userId: userId,
        filename: filename
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
    const { filename, content } = req.body;
    const userId = req.user.userId;

    if (!filename) {
      return res.status(400).json({ error: 'Nombre de archivo requerido' });
    }

    // Verificar si ya existe el archivo
    const existingFile = await prisma.examFile.findFirst({
      where: {
        examId: parseInt(examId),
        userId: userId,
        filename: filename
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
          content: content || ''
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

    const file = await prisma.examFile.findFirst({
      where: {
        examId: parseInt(examId),
        userId: userId,
        filename: filename
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

  return router;
};

export default ExamFilesRoute;