import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';

const prisma = new PrismaClient();

export const createRankingRoutes = () => {
  const router = Router();

  // Obtener ranking de un examen específico por ventana
  router.get('/exam-window/:windowId', authenticateToken, async (req, res) => {
    try {
      const windowId = parseInt(req.params.windowId);
      const userId = req.user!.userId;
      const userRole = req.user!.rol;

      // Verificar que la ventana existe
      const examWindow = await prisma.examWindow.findUnique({
        where: { id: windowId },
        include: {
          exam: {
            select: {
              id: true,
              titulo: true,
              profesorId: true,
              tipo: true
            }
          }
        }
      });

      if (!examWindow) {
        return res.status(404).json({ error: 'Ventana de examen no encontrada' });
      }

      // Solo el profesor o estudiantes inscritos pueden ver el ranking
      if (userRole === 'student') {
        const inscription = await prisma.inscription.findUnique({
          where: {
            userId_examWindowId: {
              userId: userId,
              examWindowId: windowId
            }
          }
        });

        if (!inscription) {
          return res.status(403).json({ error: 'No tienes acceso a este ranking' });
        }
      } else if (userRole === 'professor' && examWindow.exam.profesorId !== userId) {
        return res.status(403).json({ error: 'No tienes acceso a este ranking' });
      }

      // Obtener todos los intentos finalizados de esta ventana
      const attempts = await prisma.examAttempt.findMany({
        where: {
          examWindowId: windowId,
          estado: 'finalizado',
          finishedAt: {
            not: null
          }
        },
        include: {
          user: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          }
        }
      });

      // Calcular el tiempo de realización y crear los datos base
      const attemptsData = attempts.map((attempt) => {
        const timeInSeconds = attempt.finishedAt && attempt.startedAt
          ? Math.floor((new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000)
          : null;

        const timeInMinutes = timeInSeconds ? Math.floor(timeInSeconds / 60) : null;
        const remainingSeconds = timeInSeconds ? timeInSeconds % 60 : null;

        return {
          userId: attempt.user.id,
          nombreEstudiante: attempt.user.nombre,
          email: attempt.user.email,
          puntaje: attempt.puntaje,
          tiempoSegundos: timeInSeconds,
          tiempoFormateado: timeInSeconds 
            ? `${timeInMinutes}m ${remainingSeconds}s`
            : 'N/A',
          fechaInicio: attempt.startedAt,
          fechaFin: attempt.finishedAt,
          esUsuarioActual: attempt.user.id === userId
        };
      });

      // Crear ranking por TIEMPO (para exámenes de programación o tiempos)
      const rankingPorTiempo = attemptsData
        .filter(r => r.tiempoSegundos !== null) // Solo incluir intentos con tiempo válido
        .sort((a, b) => (a.tiempoSegundos || 0) - (b.tiempoSegundos || 0)) // Ordenar por tiempo (menor primero)
        .map((r, index) => ({ ...r, posicionTiempo: index + 1 }));

      // Crear ranking por PUNTAJE (para exámenes múltiple choice)
      const rankingPorPuntaje = attemptsData
        .filter(r => r.puntaje !== null && r.puntaje !== undefined) // Solo incluir intentos con puntaje
        .sort((a, b) => {
          // Primero ordenar por puntaje (mayor a menor)
          if ((b.puntaje || 0) !== (a.puntaje || 0)) {
            return (b.puntaje || 0) - (a.puntaje || 0);
          }
          // Si tienen el mismo puntaje, ordenar por tiempo (menor a mayor)
          return (a.tiempoSegundos || Infinity) - (b.tiempoSegundos || Infinity);
        })
        .map((r, index) => ({ ...r, posicionPuntaje: index + 1 }));

      // Encontrar la posición del usuario actual si es estudiante
      const posicionUsuarioTiempo = rankingPorTiempo.find(r => r.esUsuarioActual);
      const posicionUsuarioPuntaje = rankingPorPuntaje.find(r => r.esUsuarioActual);

      // Calcular estadísticas de TIEMPO
      const mejorTiempo = rankingPorTiempo.length > 0 ? rankingPorTiempo[0] : null;
      const peorTiempo = rankingPorTiempo.length > 0 ? rankingPorTiempo[rankingPorTiempo.length - 1] : null;
      
      const promedioTiempoCalc = rankingPorTiempo.length > 0
        ? Math.floor(rankingPorTiempo.reduce((acc, r) => acc + (r.tiempoSegundos || 0), 0) / rankingPorTiempo.length)
        : null;

      const promedioMinutos = promedioTiempoCalc ? Math.floor(promedioTiempoCalc / 60) : null;
      const promedioSegundos = promedioTiempoCalc ? promedioTiempoCalc % 60 : null;

      // Calcular estadísticas de PUNTAJE
      const mejorPuntaje = rankingPorPuntaje.length > 0 ? rankingPorPuntaje[0] : null;
      const peorPuntaje = rankingPorPuntaje.length > 0 ? rankingPorPuntaje[rankingPorPuntaje.length - 1] : null;
      
      const promedioPuntajeCalc = rankingPorPuntaje.length > 0
        ? rankingPorPuntaje.reduce((acc, r) => acc + (r.puntaje || 0), 0) / rankingPorPuntaje.length
        : null;

      res.json({
        examWindow: {
          id: examWindow.id,
          titulo: examWindow.exam.titulo,
          tipo: examWindow.exam.tipo,
          fechaInicio: examWindow.fechaInicio,
          duracion: examWindow.duracion,
          sinTiempo: examWindow.sinTiempo
        },
        rankingPorTiempo,
        rankingPorPuntaje,
        totalParticipantes: attemptsData.length,
        posicionUsuarioTiempo: posicionUsuarioTiempo?.posicionTiempo || null,
        posicionUsuarioPuntaje: posicionUsuarioPuntaje?.posicionPuntaje || null,
        estadisticasTiempo: {
          mejorTiempo: mejorTiempo?.tiempoSegundos || null,
          mejorTiempoFormateado: mejorTiempo?.tiempoFormateado || null,
          promedioTiempo: promedioTiempoCalc,
          promedioTiempoFormateado: promedioTiempoCalc 
            ? `${promedioMinutos}m ${promedioSegundos}s`
            : null,
          peorTiempo: peorTiempo?.tiempoSegundos || null,
          peorTiempoFormateado: peorTiempo?.tiempoFormateado || null
        },
        estadisticasPuntaje: {
          mejorPuntaje: mejorPuntaje?.puntaje || null,
          peorPuntaje: peorPuntaje?.puntaje || null,
          promedioPuntaje: promedioPuntajeCalc ? parseFloat(promedioPuntajeCalc.toFixed(1)) : null
        }
      });

    } catch (error: any) {
      console.error('Error obteniendo ranking:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Obtener ranking general de un examen (todas las ventanas)
  router.get('/exam/:examId', authenticateToken, async (req, res) => {
    try {
      const examId = parseInt(req.params.examId);
      const userId = req.user!.userId;
      const userRole = req.user!.rol;

      // Verificar que el examen existe
      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        select: {
          id: true,
          titulo: true,
          profesorId: true,
          tipo: true
        }
      });

      if (!exam) {
        return res.status(404).json({ error: 'Examen no encontrado' });
      }

      // Solo el profesor puede ver el ranking general del examen
      if (userRole === 'professor' && exam.profesorId !== userId) {
        return res.status(403).json({ error: 'No tienes acceso a este ranking' });
      }

      // Para estudiantes, verificar que estén inscritos en al menos una ventana
      if (userRole === 'student') {
        const hasInscription = await prisma.inscription.findFirst({
          where: {
            userId: userId,
            examWindow: {
              examId: examId
            }
          }
        });

        if (!hasInscription) {
          return res.status(403).json({ error: 'No tienes acceso a este ranking' });
        }
      }

      // Obtener todos los intentos finalizados del examen
      const attempts = await prisma.examAttempt.findMany({
        where: {
          examId: examId,
          estado: 'finalizado',
          finishedAt: {
            not: null
          }
        },
        include: {
          user: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          },
          examWindow: {
            select: {
              id: true,
              fechaInicio: true
            }
          }
        }
      });

      // Crear el ranking ordenado por tiempo
      const ranking = attempts
        .map((attempt) => {
          const timeInSeconds = attempt.finishedAt && attempt.startedAt
            ? Math.floor((new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000)
            : null;

          const timeInMinutes = timeInSeconds ? Math.floor(timeInSeconds / 60) : null;
          const remainingSeconds = timeInSeconds ? timeInSeconds % 60 : null;

          return {
            userId: attempt.user.id,
            nombreEstudiante: attempt.user.nombre,
            email: attempt.user.email,
            puntaje: attempt.puntaje,
            tiempoSegundos: timeInSeconds,
            tiempoFormateado: timeInSeconds 
              ? `${timeInMinutes}m ${remainingSeconds}s`
              : 'N/A',
            ventanaId: attempt.examWindow?.id,
            fechaVentana: attempt.examWindow?.fechaInicio,
            fechaInicio: attempt.startedAt,
            fechaFin: attempt.finishedAt,
            esUsuarioActual: attempt.user.id === userId
          };
        })
        .filter(r => r.tiempoSegundos !== null)
        .sort((a, b) => (a.tiempoSegundos || 0) - (b.tiempoSegundos || 0))
        .map((r, index) => ({ ...r, posicion: index + 1 }));

      res.json({
        exam: {
          id: exam.id,
          titulo: exam.titulo,
          tipo: exam.tipo
        },
        ranking,
        totalParticipantes: ranking.length
      });

    } catch (error: any) {
      console.error('Error obteniendo ranking general:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Obtener el top 10 de todos los tiempos (leaderboard global)
  router.get('/global', authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.userId;

      // Obtener todos los intentos finalizados con tiempo válido
      const topAttempts = await prisma.examAttempt.findMany({
        where: {
          estado: 'finalizado',
          finishedAt: {
            not: null
          }
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
              tipo: true
            }
          }
        }
      });

      // Ordenar por tiempo y tomar el top 10 más rápidos
      const ranking = topAttempts
        .map(attempt => {
          const timeInSeconds = attempt.finishedAt && attempt.startedAt
            ? Math.floor((new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000)
            : null;

          const timeInMinutes = timeInSeconds ? Math.floor(timeInSeconds / 60) : null;
          const remainingSeconds = timeInSeconds ? timeInSeconds % 60 : null;

          return {
            userId: attempt.user.id,
            nombreEstudiante: attempt.user.nombre,
            puntaje: attempt.puntaje,
            tiempoSegundos: timeInSeconds,
            tiempoFormateado: timeInSeconds 
              ? `${timeInMinutes}m ${remainingSeconds}s`
              : 'N/A',
            examenTitulo: attempt.exam.titulo,
            examenTipo: attempt.exam.tipo,
            fechaFin: attempt.finishedAt,
            esUsuarioActual: attempt.user.id === userId
          };
        })
        .filter(r => r.tiempoSegundos !== null) // Solo incluir intentos con tiempo válido
        .sort((a, b) => (a.tiempoSegundos || 0) - (b.tiempoSegundos || 0)) // Ordenar por tiempo ascendente
        .slice(0, 10) // Top 10 más rápidos
        .map((r, index) => ({ ...r, posicion: index + 1 }));

      res.json({
        ranking,
        total: ranking.length
      });

    } catch (error: any) {
      console.error('Error obteniendo ranking global:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};
