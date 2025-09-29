import { type PrismaClient } from "@prisma/client";
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

      if (new Date() >= new Date(examWindow.fechaInicio)) {
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
                  select: { titulo: true }
                }
              }
            }
          }
        });

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
                select: { titulo: true }
              }
            }
          }
        }
      });

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
          examWindow: true
        }
      });

      if (!inscription) {
        return res.status(404).json({ error: 'Inscripción no encontrada' });
      }

      // Verificar que la ventana no haya comenzado
      if (new Date() >= new Date(inscription.examWindow.fechaInicio)) {
        return res.status(400).json({ error: 'No se puede cancelar la inscripción una vez que la ventana comenzó' });
      }

      // Marcar como cancelada
      await prisma.inscription.update({
        where: { id: inscriptionId },
        data: { cancelledAt: new Date() }
      });

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
        return res.status(404).json({ error: 'Inscripción no encontrada o no tienes permisos' });
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