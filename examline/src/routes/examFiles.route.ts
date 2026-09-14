import { type PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';

const ExamFilesRoute = (prisma: PrismaClient) => {
  const router = Router();



// Obtener todos los archivos de un examen para un estudiante
router.get('/:examId/files', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.rol;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito en una ventana activa de este examen
    if (userRole === 'student') {
      const inscription = await prisma.inscription.findFirst({
        where: {
          userId: userId,
          examWindow: {
            examId: parseInt(examId),
            activa: true
          },
          cancelledAt: null
        },
        include: { examWindow: true }
      });

      if (!inscription) {
        return res.status(403).json({ error: 'No estás inscrito en una ventana activa de este examen' });
      }
    }

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
    const userId = req.user!.userId;
    const userRole = req.user!.rol;
    const version = req.query.version || 'manual'; // Obtener versión del query param

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
    if (userRole === 'student') {
      const inscription = await prisma.inscription.findFirst({
        where: {
          userId: userId,
          examWindow: {
            examId: parseInt(examId),
            activa: true
          },
          cancelledAt: null
        }
      });

      if (!inscription) {
        return res.status(403).json({ error: 'No estás inscrito en una ventana activa de este examen' });
      }
    }

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
    const userId = req.user!.userId;
    const userRole = req.user!.rol;

    if (!filename) {
      return res.status(400).json({ error: 'Nombre de archivo requerido' });
    }

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
    if (userRole === 'student') {
      const inscription = await prisma.inscription.findFirst({
        where: {
          userId: userId,
          examWindow: {
            examId: parseInt(examId),
            activa: true
          },
          cancelledAt: null
        }
      });

      if (!inscription) {
        return res.status(403).json({ error: 'No estás inscrito en una ventana activa de este examen' });
      }
    }

    // Usar upsert para crear o actualizar en una sola operación
    // Esto evita problemas de condición de carrera
    const file = await prisma.examFile.upsert({
      where: {
        examId_userId_filename_version: {
          examId: parseInt(examId),
          userId: userId,
          filename: filename,
          version: version
        }
      },
      update: {
        content: content || '',
        updatedAt: new Date()
      },
      create: {
        examId: parseInt(examId),
        userId: userId,
        filename: filename,
        content: content || '',
        version: version
      }
    });

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
    if (userRole === 'student') {
      const inscription = await prisma.inscription.findFirst({
        where: {
          userId: userId,
          examWindow: {
            examId: parseInt(examId),
            activa: true
          },
          cancelledAt: null
        }
      });

      if (!inscription) {
        return res.status(403).json({ error: 'No estás inscrito en una ventana activa de este examen' });
      }
    }

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
    const userId = req.user!.userId;
    const userRole = req.user!.rol;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Se requiere un array de archivos' });
    }

    // 🔒 Validación de seguridad: verificar que el estudiante esté inscrito
    if (userRole === 'student') {
      const inscription = await prisma.inscription.findFirst({
        where: {
          userId: userId,
          examWindow: {
            examId: parseInt(examId),
            activa: true
          },
          cancelledAt: null
        }
      });

      if (!inscription) {
        return res.status(403).json({ error: 'No estás inscrito en una ventana activa de este examen' });
      }
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

// Endpoints para solución de referencia (solo profesores)

// Obtener archivos de solución de referencia de un examen
router.get('/:examId/reference-solution', authenticateToken, async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user!.userId;

    // Verificar que el examen existe y el usuario es el profesor
    const exam = await prisma.exam.findUnique({
      where: { id: parseInt(examId) }
    });

    if (!exam) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }

    if (exam.profesorId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para ver la solución de referencia' });
    }

    const files = await prisma.examFile.findMany({
      where: {
        examId: parseInt(examId),
        userId: exam.profesorId,
        version: 'reference_solution'
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
        filename: 'asc'
      }
    });

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
    const exam = await prisma.exam.findUnique({
      where: { id: parseInt(examId) }
    });

    if (!exam) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }

    if (exam.profesorId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para modificar la solución de referencia' });
    }

    if (exam.tipo !== 'programming') {
      return res.status(400).json({ error: 'Solo los exámenes de programación pueden tener solución de referencia' });
    }

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Se requiere un array de archivos' });
    }

    // Crear/actualizar todos los archivos con versión "reference_solution"
    const savedFiles = [];
    for (const fileData of files) {
      const { filename, content } = fileData;
      
      if (!filename) {
        continue;
      }

      const file = await prisma.examFile.upsert({
        where: {
          examId_userId_filename_version: {
            examId: parseInt(examId),
            userId: exam.profesorId,
            filename: filename,
            version: 'reference_solution'
          }
        },
        update: {
          content: content || '',
          updatedAt: new Date()
        },
        create: {
          examId: parseInt(examId),
          userId: exam.profesorId,
          filename: filename,
          content: content || '',
          version: 'reference_solution'
        }
      });

      savedFiles.push(file);
    }

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
    const exam = await prisma.exam.findUnique({
      where: { id: parseInt(examId) }
    });

    if (!exam) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }

    if (exam.profesorId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar archivos de referencia' });
    }

    const file = await prisma.examFile.findFirst({
      where: {
        examId: parseInt(examId),
        userId: exam.profesorId,
        filename: filename,
        version: 'reference_solution'
      }
    });

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    await prisma.examFile.delete({
      where: { id: file.id }
    });

    res.json({ message: 'Archivo de referencia eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting reference solution file:', error);
    res.status(500).json({ error: 'Error eliminando archivo de referencia' });
  }
});

  return router;
};

export default ExamFilesRoute;