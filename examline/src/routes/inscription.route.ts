import { type PrismaClient } from "@prisma/client";
import { notifyStatusChange } from './examWindow.route';
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const InscriptionRoute = (prisma: PrismaClient) => {
  const router = Router();

  // Inscribirse a una ventana de examen (solo estudiantes)
  router.post('/', authenticateToken, requireRole(['student']), async (req, res) => {
    const { examWindowId } = req.body;
    const userId = req.user!.userId;

    try {
      // Verificar que la ventana existe y está disponible
      const examWindow = await prisma.examWindow.findUnique({
        where: { id: examWindowId },
        include: {
          inscripciones: {
            where: { cancelledAt: null } // solo inscripciones activas
          }
        }
      });

      if (!examWindow) {
        return res.status(404).json({ error: 'Ventana de examen no encontrada' });
      }

      // Validaciones
      if (!examWindow.activa) {
        return res.status(400).json({ error: 'Esta ventana no está disponible para inscripciones' });
      }

      if (examWindow.estado !== 'programada') {
        return res.status(400).json({ error: 'No se puede inscribir a esta ventana en su estado actual' });
      }

      // Solo verificar fecha de inicio para ventanas con tiempo
      if (!examWindow.sinTiempo && examWindow.fechaInicio && new Date() >= new Date(examWindow.fechaInicio)) {
        return res.status(400).json({ error: 'No se puede inscribir a una ventana que ya comenzó' });
      }

      // Verificar cupo
      if (examWindow.inscripciones.length >= examWindow.cupoMaximo) {
        return res.status(400).json({ error: 'No hay cupo disponible en esta ventana' });
      }

      // Verificar si ya está inscrito
      const existingInscription = await prisma.inscription.findUnique({
        where: {
          userId_examWindowId: {
            userId,
            examWindowId
          }
        }
      });

      if (existingInscription && !existingInscription.cancelledAt) {
        return res.status(400).json({ error: 'Ya estás inscrito en esta ventana' });
      }

      // Si había una inscripción cancelada, la reactivamos
      if (existingInscription && existingInscription.cancelledAt) {
        const reactivatedInscription = await prisma.inscription.update({
          where: { id: existingInscription.id },
          data: { 
            cancelledAt: null,
            inscribedAt: new Date()
          },
          include: {
            examWindow: {
              include: {
                exam: {
                  select: { titulo: true, profesorId: true }
                },
                inscripciones: { where: { cancelledAt: null } }
              }
            }
          }
        });
        // Si al reactivar se llenó el cupo, cerrar inscripciones
        const ocupados = reactivatedInscription.examWindow.inscripciones.length;
        const max = (reactivatedInscription.examWindow as any).cupoMaximo;
        if (ocupados >= max && (reactivatedInscription.examWindow as any).estado === 'programada') {
          const closed = await prisma.examWindow.update({
            where: { id: reactivatedInscription.examWindowId },
            data: { estado: 'cerrada_inscripciones' },
            include: { exam: { select: { profesorId: true, titulo: true } } }
          });

          // Notificar al profesor
          notifyStatusChange((closed.exam as any).profesorId, [{
            id: closed.id,
            titulo: (closed.exam as any).titulo,
            estadoAnterior: 'programada',
            estadoNuevo: 'cerrada_inscripciones',
            fechaInicio: (closed as any).fechaInicio,
            timestamp: Date.now()
          }]);
        }

        return res.status(201).json(reactivatedInscription);
      }

      // Crear nueva inscripción
      const inscription = await prisma.inscription.create({
        data: {
          userId,
          examWindowId
        },
        include: {
          examWindow: {
            include: {
              exam: {
                select: { titulo: true, profesorId: true }
              },
              inscripciones: { where: { cancelledAt: null } }
            }
          }
        }
      });

      // Verificar cupo actualizado y cerrar automáticamente si se llena
      const ocupados = inscription.examWindow.inscripciones.length;
      const max = (inscription.examWindow as any).cupoMaximo;

      if (ocupados >= max && (inscription.examWindow as any).estado === 'programada') {
        const closed = await prisma.examWindow.update({
          where: { id: examWindowId },
          data: { estado: 'cerrada_inscripciones' },
          include: { exam: { select: { profesorId: true, titulo: true } } }
        });

        // Notificar al profesor en tiempo real
        notifyStatusChange((closed.exam as any).profesorId, [{
          id: closed.id,
          titulo: (closed.exam as any).titulo,
          estadoAnterior: 'programada',
          estadoNuevo: 'cerrada_inscripciones',
          fechaInicio: (closed as any).fechaInicio,
          timestamp: Date.now()
        }]);
      }

      res.status(201).json(inscription);
    } catch (error: any) {
      console.error('Error en inscripción:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Obtener inscripciones del usuario
  router.get('/mis-inscripciones', authenticateToken, requireRole(['student']), async (req, res) => {
    try {
      const inscriptions = await prisma.inscription.findMany({
        where: {
          userId: req.user!.userId,
          cancelledAt: null
        },
        include: {
          examWindow: {
            include: {
              exam: {
                select: { 
                  id: true, 
                  titulo: true,
                  profesor: {
                    select: { nombre: true }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          examWindow: {
            fechaInicio: 'asc'
          }
        }
      });

      res.json(inscriptions);
    } catch (error: any) {
      console.error('Error obteniendo inscripciones:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Cancelar inscripción
  router.delete('/:id', authenticateToken, requireRole(['student']), async (req, res) => {
    const inscriptionId = parseInt(req.params.id);
    const userId = req.user!.userId;

    try {
      // Verificar que la inscripción existe y pertenece al usuario
      const inscription = await prisma.inscription.findFirst({
        where: {
          id: inscriptionId,
          userId: userId,
          cancelledAt: null
        },
        include: {
          examWindow: {
            include: {
              exam: { select: { titulo: true } }
            }
          }
        }
      });

      if (!inscription) {
        return res.status(404).json({ error: 'Inscripción no encontrada' });
      }

      // Verificar que la ventana no haya comenzado (solo para ventanas con tiempo)
      if (!inscription.examWindow.sinTiempo && inscription.examWindow.fechaInicio && 
          new Date() >= new Date(inscription.examWindow.fechaInicio)) {
        return res.status(400).json({ error: 'No se puede cancelar la inscripción una vez que la ventana comenzó' });
      }

      // Marcar como cancelada
      const cancelledInscription = await prisma.inscription.update({
        where: { id: inscriptionId },
        data: { cancelledAt: new Date() }
      });

      // 🔄 Reabrir inscripciones si había estado "cerrada_inscripciones" y ahora hay cupo
      try {
        const windowNow = await prisma.examWindow.findUnique({
          where: { id: inscription.examWindow.id },
          include: {
            exam: { select: { profesorId: true, titulo: true } },
            inscripciones: { where: { cancelledAt: null } }
          }
        });

        if (windowNow) {
          const ocupados = windowNow.inscripciones.length;
          const max = windowNow.cupoMaximo;
          const now = new Date();

          // Solo reabrir si:
          // - Estado actual es 'cerrada_inscripciones'
          // - Hay cupo disponible
          // - Para ventanas sin tiempo: siempre se puede reabrir
          // - Para ventanas con tiempo: aún no comenzó la ventana
          const canReopen = windowNow.sinTiempo || 
                          (windowNow.fechaInicio && now < new Date(windowNow.fechaInicio));

          if (windowNow.estado === 'cerrada_inscripciones' && ocupados < max && canReopen) {
            const reopened = await prisma.examWindow.update({
              where: { id: windowNow.id },
              data: { estado: 'programada' }
            });

            // Notificar al profesor en tiempo real
            notifyStatusChange(windowNow.exam.profesorId, [{
              id: windowNow.id,
              titulo: windowNow.exam.titulo,
              estadoAnterior: 'cerrada_inscripciones',
              estadoNuevo: 'programada',
              fechaInicio: windowNow.fechaInicio,
              timestamp: Date.now()
            }]);
          }
        }
      } catch (e) {
        // Error evaluando reapertura automática
        console.error('Error evaluando reapertura:', e);
      }

      res.json({ success: true, message: 'Inscripción cancelada correctamente' });
    } catch (error: any) {
      console.error('Error cancelando inscripción:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Obtener inscripciones de una ventana (para profesores)
  router.get('/ventana/:windowId', authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.windowId);

    try {
      // Verificar que la ventana pertenece al profesor
      const examWindow = await prisma.examWindow.findFirst({
        where: {
          id: windowId,
          exam: {
            profesorId: req.user!.userId
          }
        }
      });

      if (!examWindow) {
        return res.status(404).json({ error: 'Ventana no encontrada o no tienes permisos' });
      }

      const inscriptions = await prisma.inscription.findMany({
        where: {
          examWindowId: windowId,
          cancelledAt: null
        },
        include: {
          user: {
            select: { id: true, nombre: true, email: true }
          }
        },
        orderBy: {
          inscribedAt: 'asc'
        }
      });

      res.json(inscriptions);
    } catch (error: any) {
      console.error('Error obteniendo inscripciones de ventana:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Marcar asistencia (para profesores)
  router.patch('/:id/asistencia', authenticateToken, requireRole(['professor']), async (req, res) => {
    const inscriptionId = parseInt(req.params.id);
    const { presente } = req.body;

    try {
      // Verificar que la inscripción existe y la ventana pertenece al profesor
      const inscription = await prisma.inscription.findFirst({
        where: {
          id: inscriptionId,
          examWindow: {
            exam: {
              profesorId: req.user!.userId
            }
          }
        }
      });

      if (!inscription) {
        // Verificar si la inscripción existe primero
        const existsInscription = await prisma.inscription.findUnique({
          where: { id: inscriptionId }
        });

        if (!existsInscription) {
          return res.status(404).json({ error: 'Inscripción no encontrada' });
        } else {
          // La inscripción existe pero el profesor no tiene permisos
          return res.status(403).json({ error: 'No tienes permisos para esta inscripción' });
        }
      }

      const updatedInscription = await prisma.inscription.update({
        where: { id: inscriptionId },
        data: { presente: presente }
      });

      res.json({ success: true, presente: updatedInscription.presente });
    } catch (error: any) {
      console.error('Error marcando asistencia:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};

export default InscriptionRoute;