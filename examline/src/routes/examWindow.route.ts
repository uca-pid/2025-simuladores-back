import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

function parseLocalDate(dateString: string): Date {
  let fecha: string, hora: string;

  if (dateString.includes("T")) {
    [fecha, hora] = dateString.split("T");
  } else {
    [fecha, hora] = dateString.split(" ");
  }

  const [year, month, day] = fecha.split("-").map(Number);
  const [hours, minutes] = hora.split(":").map(Number);

  return new Date(year, month - 1, day, hours, minutes);
}

// Convierte string de filtro a Date en hora local
function parseFiltroFecha(dateString: string): Date {
  if (!dateString) throw new Error("No se recibió fecha válida");

  // Solo consideramos la parte de fecha, ignorando hora si existe
  const [fecha] = dateString.split("T");
  const [year, month, day] = fecha.split("-").map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

// Función auxiliar para actualizar estados automáticamente
async function updateWindowStatuses(prisma: PrismaClient, profesorId?: number, returnChanges = false) {
  const now = new Date();
  
  // Obtener ventanas según el profesor (si se especifica) o todas
  const whereClause: any = {};
  if (profesorId) {
    whereClause.exam = { profesorId: profesorId };
  }
  
  const examWindows = await prisma.examWindow.findMany({
    where: whereClause,
    include: returnChanges ? {
      exam: { select: { id: true, titulo: true } }
    } : undefined
  });

  let updatedWindows = [];

  for (const window of examWindows) {
    const startDate = new Date(window.fechaInicio);
    const endDate = new Date(startDate.getTime() + (window.duracion * 60 * 1000));
    let newStatus = window.estado;
    let shouldUpdate = false;

    // Lógica de transición automática
    if (now >= startDate && now <= endDate && window.estado !== 'en_curso' && window.estado !== 'finalizada') {
      // Si está en el horario del examen y no está ya en curso o finalizada
      newStatus = 'en_curso';
      shouldUpdate = true;
    } else if (now > endDate && window.estado !== 'finalizada') {
      // Si ya pasó el tiempo del examen
      newStatus = 'finalizada';
      shouldUpdate = true;
    }

    // Actualizar si hay cambio
    if (shouldUpdate) {
      await prisma.examWindow.update({
        where: { id: window.id },
        data: { estado: newStatus }
      });

      if (returnChanges) {
        updatedWindows.push({
          id: window.id,
          titulo: (window as any).exam.titulo,
          estadoAnterior: window.estado,
          estadoNuevo: newStatus,
          fechaInicio: window.fechaInicio
        });
      }
    }
  }

  return updatedWindows;
}



const ExamWindowRoute = (prisma: PrismaClient) => {
  const router = Router();

  router.post('/', authenticateToken, requireRole(['professor']), async (req, res) => {
  const { examId, fechaInicio, duracion, modalidad, cupoMaximo, notas } = req.body;

  try {
        const examIdNumber = parseInt(examId);
        const duracionNumber = parseInt(duracion);
        const cupoMaximoNumber = parseInt(cupoMaximo);

        if (isNaN(examIdNumber)) {
          return res
            .status(400)
            .json({ error: "examId debe ser un número válido" });
        }

        const exam = await prisma.exam.findFirst({
          where: { id: examIdNumber, profesorId: req.user!.userId },
        });

        if (!exam) {
          return res.status(404).json({
            error: "Examen no encontrado o no tienes permisos para modificarlo",
          });
        }

        if (!fechaInicio || !duracionNumber || !modalidad || !cupoMaximoNumber) {
          return res
            .status(400)
            .json({ error: "Faltan campos requeridos" });
        }

        if (!["remoto", "presencial"].includes(modalidad)) {
          return res
            .status(400)
            .json({ error: 'Modalidad debe ser "remoto" o "presencial"' });
        }

        if (cupoMaximoNumber < 1) {
          return res
            .status(400)
            .json({ error: "El cupo máximo debe ser mayor a 0" });
        }

        if (duracionNumber < 1) {
          return res
            .status(400)
            .json({ error: "La duración debe ser mayor a 0 minutos" });
        }

        const fechaInicioDate = parseLocalDate(fechaInicio);

        const examWindow = await prisma.examWindow.create({
          data: {
            examId: examIdNumber,
            fechaInicio: fechaInicioDate,
            duracion: duracionNumber,
            modalidad,
            cupoMaximo: cupoMaximoNumber,
            notas: notas || null,
          },
          include: {
            exam: { select: { id: true, titulo: true } },
            inscripciones: true,
          },
        });

        res.status(201).json(examWindow);
      } catch (error: any) {
        console.error("Error creando ventana de examen:", error);
        res.status(500).json({ error: "Error interno del servidor" });
      }
    }
  );


  // Obtener ventanas de examen del profesor
  router.get('/profesor', authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      // Primero actualizar estados automáticamente
      await updateWindowStatuses(prisma, req.user!.userId);
      
      // Luego obtener las ventanas actualizadas
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
    // Primero actualizar estados automáticamente de todas las ventanas
    await updateWindowStatuses(prisma);
    
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
          contains: materia as string
        }
      };
    }

    // Filtro por profesor
    if (profesor) {
      whereClause.exam = {
        ...whereClause.exam,
        profesor: {
          nombre: {
            contains: profesor as string
          }
        }
      };
    }

    // Filtro por fecha
    if (fecha) {
  const fechaInicio = parseFiltroFecha(fecha as string);

  const fechaFin = new Date(fechaInicio);
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
          where: { cancelledAt: null }, // Solo inscripciones activas
          select: { id: true, userId: true }
        }
      },
      orderBy: {
        fechaInicio: 'asc'
      }
    });

    // 🔍 DEBUG: Calcular cupos disponibles
    const examWindowsWithInfo = examWindows.map(window => {
      const inscripcionesActivas = window.inscripciones.length;
      const cupoDisponible = window.cupoMaximo - inscripcionesActivas;
      const yaInscrito = window.inscripciones.some(ins => ins.userId === req.user!.userId);
      
      console.log(`📊 DEBUG INSCRIPCIONES - Ventana ${window.id} (${window.exam.titulo}):`);
      console.log(`    👥 Total inscripciones activas: ${inscripcionesActivas}`);
      console.log(`    🎯 Usuario ${req.user!.userId} inscrito: ${yaInscrito}`);
      console.log(`    📋 IDs de usuarios inscritos:`, window.inscripciones.map(ins => ins.userId));
      
      return {
        ...window,
        cupoDisponible,
        yaInscrito
      };
    });

    res.json(examWindowsWithInfo);
  } catch (error: any) {
    console.error('❌ Error obteniendo ventanas disponibles:', error);
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

  // Alternar estado de inscripciones (Programada <-> Cerrada a inscripciones)
  router.patch('/:id/toggle-inscripciones', authenticateToken, requireRole(['professor']), async (req, res) => {
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

      // Solo permitir toggle entre 'programada' y 'cerrada_inscripciones'
      if (!['programada', 'cerrada_inscripciones'].includes(existingWindow.estado)) {
        return res.status(400).json({ 
          error: 'Solo se puede alternar inscripciones en ventanas programadas o cerradas a inscripciones' 
        });
      }

      const newEstado = existingWindow.estado === 'programada' ? 'cerrada_inscripciones' : 'programada';

      const updatedWindow = await prisma.examWindow.update({
        where: { id: windowId },
        data: { estado: newEstado },
        include: {
          exam: { select: { id: true, titulo: true } },
          inscripciones: {
            include: {
              user: { select: { id: true, nombre: true, email: true } }
            }
          }
        }
      });

      res.json({ 
        success: true, 
        estado: updatedWindow.estado,
        message: `Inscripciones ${newEstado === 'programada' ? 'abiertas' : 'cerradas'}`,
        window: updatedWindow
      });
    } catch (error: any) {
      console.error('Error alternando inscripciones:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Actualizar estados automáticamente basado en fechas y horarios
  router.patch('/update-statuses', authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const updatedWindows = await updateWindowStatuses(prisma, req.user!.userId, true);

      res.json({ 
        success: true, 
        message: `Se actualizaron ${updatedWindows.length} ventanas`,
        updatedCount: updatedWindows.length,
        updatedWindows: updatedWindows
      });
    } catch (error: any) {
      console.error('Error actualizando estados:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};

export default ExamWindowRoute;