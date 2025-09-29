import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const ExamWindowRoute = (prisma: PrismaClient) => {
  const router = Router();

  router.post('/', authenticateToken, requireRole(['professor']), async (req, res) => {
  const { examId, fechaInicio, duracion, modalidad, cupoMaximo, notas } = req.body;

  try {
    // Convertir a número lo que corresponde
    const examIdNumber = parseInt(examId);
    const duracionNumber = parseInt(duracion);
    const cupoMaximoNumber = parseInt(cupoMaximo);

    if (isNaN(examIdNumber)) {
      return res.status(400).json({ error: 'examId debe ser un número válido' });
    }

    // Verificar que el examen existe y pertenece al profesor
    const exam = await prisma.exam.findFirst({
      where: {
        id: examIdNumber,
        profesorId: req.user!.userId
      }
    });

    if (!exam) {
      return res.status(404).json({ error: 'Examen no encontrado o no tienes permisos para modificarlo' });
    }

    // Validar datos
    if (!fechaInicio || !duracionNumber || !modalidad || !cupoMaximoNumber) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    if (!['remoto', 'presencial'].includes(modalidad)) {
      return res.status(400).json({ error: 'Modalidad debe ser "remoto" o "presencial"' });
    }

    if (cupoMaximoNumber < 1) {
      return res.status(400).json({ error: 'El cupo máximo debe ser mayor a 0' });
    }

    if (duracionNumber < 1) {
      return res.status(400).json({ error: 'La duración debe ser mayor a 0 minutos' });
    }

    const examWindow = await prisma.examWindow.create({
      data: {
        examId: examIdNumber,
        fechaInicio: new Date(fechaInicio),
        duracion: duracionNumber,
        modalidad,
        cupoMaximo: cupoMaximoNumber,
        notas: notas || null
      },
      include: {
        exam: { select: { id: true, titulo: true } },
        inscripciones: true
      }
    });

    res.status(201).json(examWindow);
  } catch (error: any) {
    console.error('Error creando ventana de examen:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


  // Obtener ventanas de examen del profesor
  router.get('/profesor', authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const examWindows = await prisma.examWindow.findMany({
        where: {
          exam: {
            profesorId: req.user!.userId
          }
        },
        include: {
          exam: {
            select: { id: true, titulo: true }
          },
          inscripciones: {
            include: {
              user: {
                select: { id: true, nombre: true, email: true }
              }
            }
          }
        },
        orderBy: {
          fechaInicio: 'asc'
        }
      });

      res.json(examWindows);
    } catch (error: any) {
      console.error('Error obteniendo ventanas de examen:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

// Obtener ventanas disponibles para estudiantes
router.get('/disponibles', authenticateToken, requireRole(['student']), async (req, res) => {
  const { materia, profesor, fecha } = req.query;

  try {
    const whereClause: any = {
      activa: true,
      estado: 'programada',
      fechaInicio: {
        gt: new Date() // solo ventanas futuras
      }
    };

    // Filtro por materia
    if (materia) {
      whereClause.exam = {
        titulo: {
          contains: materia as string // ya no usamos 'mode'
        }
      };
    }

    // Filtro por profesor
    if (profesor) {
      whereClause.exam = {
        ...whereClause.exam,
        profesor: {
          nombre: {
            contains: profesor as string // ya no usamos 'mode'
          }
        }
      };
    }

    // Filtro por fecha
    if (fecha) {
      const fechaFiltro = new Date(fecha as string);
      const fechaInicio = new Date(fechaFiltro);
      fechaInicio.setHours(0, 0, 0, 0);
      const fechaFin = new Date(fechaFiltro);
      fechaFin.setHours(23, 59, 59, 999);

      whereClause.fechaInicio = {
        gte: fechaInicio,
        lte: fechaFin
      };
    }

    const examWindows = await prisma.examWindow.findMany({
      where: whereClause,
      include: {
        exam: {
          select: { 
            id: true, 
            titulo: true,
            profesor: {
              select: { nombre: true }
            }
          }
        },
        inscripciones: {
          select: { id: true, userId: true }
        }
      },
      orderBy: {
        fechaInicio: 'asc'
      }
    });

    // Agregar información de cupos disponibles y si el usuario ya está inscrito
    const examWindowsWithInfo = examWindows.map(window => ({
      ...window,
      cupoDisponible: window.cupoMaximo - window.inscripciones.length,
      yaInscrito: window.inscripciones.some(ins => ins.userId === req.user!.userId)
    }));

    res.json(examWindowsWithInfo);
  } catch (error: any) {
    console.error('Error obteniendo ventanas disponibles:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


  // Actualizar ventana de examen
  router.put('/:id', authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.id);
    const { fechaInicio, duracion, modalidad, cupoMaximo, notas, activa, estado } = req.body;

    try {
      // Verificar que la ventana existe y pertenece al profesor
      const existingWindow = await prisma.examWindow.findFirst({
        where: {
          id: windowId,
          exam: {
            profesorId: req.user!.userId
          }
        }
      });

      if (!existingWindow) {
        return res.status(404).json({ error: 'Ventana no encontrada o no tienes permisos' });
      }

      const updateData: any = {};
      
      if (fechaInicio) updateData.fechaInicio = new Date(fechaInicio);
      if (duracion !== undefined) updateData.duracion = Number(duracion);
      if (modalidad) updateData.modalidad = modalidad;
      if (cupoMaximo !== undefined) updateData.cupoMaximo = Number(cupoMaximo);
      if (notas !== undefined) updateData.notas = notas;
      if (activa !== undefined) updateData.activa = activa;
      if (estado) updateData.estado = estado;

      const updatedWindow = await prisma.examWindow.update({
        where: { id: windowId },
        data: updateData,
        include: {
          exam: {
            select: { id: true, titulo: true }
          },
          inscripciones: {
            include: {
              user: {
                select: { id: true, nombre: true, email: true }
              }
            }
          }
        }
      });

      res.json(updatedWindow);
    } catch (error: any) {
      console.error('Error actualizando ventana:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Toggle rápido de activación/desactivación
  router.patch('/:id/toggle', authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.id);

    try {
      // Verificar que la ventana existe y pertenece al profesor
      const existingWindow = await prisma.examWindow.findFirst({
        where: {
          id: windowId,
          exam: {
            profesorId: req.user!.userId
          }
        }
      });

      if (!existingWindow) {
        return res.status(404).json({ error: 'Ventana no encontrada o no tienes permisos' });
      }

      const updatedWindow = await prisma.examWindow.update({
        where: { id: windowId },
        data: {
          activa: !existingWindow.activa
        }
      });

      res.json({ success: true, activa: updatedWindow.activa });
    } catch (error: any) {
      console.error('Error en toggle:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Eliminar ventana de examen
  router.delete('/:id', authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.id);

    try {
      // Verificar que la ventana existe y pertenece al profesor
      const existingWindow = await prisma.examWindow.findFirst({
        where: {
          id: windowId,
          exam: {
            profesorId: req.user!.userId
          }
        },
        include: {
          inscripciones: true
        }
      });

      if (!existingWindow) {
        return res.status(404).json({ error: 'Ventana no encontrada o no tienes permisos' });
      }

      // No permitir eliminar si ya hay inscripciones
      if (existingWindow.inscripciones.length > 0) {
        return res.status(400).json({ error: 'No se puede eliminar una ventana con inscripciones' });
      }

      await prisma.examWindow.delete({
        where: { id: windowId }
      });

      res.json({ success: true, message: 'Ventana eliminada correctamente' });
    } catch (error: any) {
      console.error('Error eliminando ventana:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};

export default ExamWindowRoute;