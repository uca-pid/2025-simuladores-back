import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

// Variable global para almacenar la instancia de Socket.IO
let io: any = null;

// Función para configurar Socket.IO (será llamada desde el main server)
export const setSocketIO = (socketInstance: any) => {
  io = socketInstance;
  console.log('✅ Socket.IO configurado en ExamWindowRoute');
};

// Permitir a otros módulos notificar cambios de estado via WebSocket
export const notifyStatusChange = (profesorId: number, changes: any[]) => {
  try {
    broadcastStatusUpdate(profesorId, changes);
  } catch (e) {
    console.log('⚠️ No se pudo emitir notificación de estado:', (e as any)?.message || e);
  }
};

// 🚀 Función ULTRA-OPTIMIZADA para broadcast de milisegundos
const broadcastStatusUpdate = (profesorId: number, changes: any[]) => {
  if (io && changes.length > 0) {
    const broadcastStartTime = process.hrtime.bigint();
    
    // Payload ultra-optimizado (mínimo JSON)
    const optimizedPayload = {
      t: 'sc', // type: status_change (abreviado)
      c: changes.map(change => ({
        i: change.id,           // id
        s: change.estadoNuevo,  // estado (solo el nuevo)
        ts: change.timestamp || Date.now() // timestamp preciso
      })),
      ts: Date.now() // timestamp del broadcast
    };
    
    console.log(`📡 BROADCAST ULTRA-RÁPIDO → profesor ${profesorId}`);
    
    // Envío inmediato sin compresión ni validaciones adicionales
    io.to(`professor_${profesorId}`).emit('su', optimizedPayload); // 'su' = statusUpdate (abreviado)
    
    const broadcastEndTime = process.hrtime.bigint();
    const broadcastLatency = Number(broadcastEndTime - broadcastStartTime) / 1000000;
    
    console.log(`⚡ Broadcast completado en ${broadcastLatency.toFixed(3)}ms`);
  } else if (changes.length > 0) {
    console.log('⚠️ Socket.IO no disponible, cambios no enviados via WebSocket');
  }
};

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
async function updateWindowStatuses(prisma: PrismaClient, profesorId?: number, returnChanges = false, broadcastChanges = false) {
  const now = new Date();
  console.log(`\n🔍 === VERIFICANDO ESTADOS === ${now.toISOString()} ===`);
  
  // Obtener ventanas según el profesor (si se especifica) o todas
  const whereClause: any = {};
  if (profesorId) {
    whereClause.exam = { profesorId: profesorId };
  }
  
  const examWindows = await prisma.examWindow.findMany({
    where: whereClause,
    include: {
      exam: { select: { id: true, titulo: true, profesorId: true } }
    }
  });

  let updatedWindows = [];
  const changesByProfesor = new Map();

  for (const window of examWindows) {
    const startDate = new Date(window.fechaInicio);
    const endDate = new Date(startDate.getTime() + (window.duracion * 60 * 1000));
    let newStatus = window.estado;
    let shouldUpdate = false;

    // Debug de fechas
    console.log(`📋 "${(window as any).exam.titulo}" (ID: ${window.id}):
      📅 Estado: ${window.estado}
      ⏰ Ahora: ${now.toISOString()}
      🎯 Inicio: ${startDate.toISOString()}
      🏁 Fin: ${endDate.toISOString()}`);

    // Lógica de transición automática
    if (now >= startDate && now <= endDate && window.estado !== 'en_curso' && window.estado !== 'finalizada') {
      newStatus = 'en_curso';
      shouldUpdate = true;
      console.log(`✅ CAMBIO: "${(window as any).exam.titulo}" → ${window.estado} → ${newStatus}`);
    } else if (now > endDate && window.estado !== 'finalizada') {
      newStatus = 'finalizada';
      shouldUpdate = true;
      console.log(`✅ CAMBIO: "${(window as any).exam.titulo}" → ${window.estado} → ${newStatus}`);
    }

    // Actualizar si hay cambio
    if (shouldUpdate) {
      await prisma.examWindow.update({
        where: { id: window.id },
        data: { estado: newStatus }
      });

      const change = {
        id: window.id,
        titulo: (window as any).exam.titulo,
        estadoAnterior: window.estado,
        estadoNuevo: newStatus,
        fechaInicio: window.fechaInicio
      };

      if (returnChanges) {
        updatedWindows.push(change);
      }

      // Agrupar cambios por profesor para WebSocket
      if (broadcastChanges) {
        const windowProfesorId = (window as any).exam.profesorId;
        if (!changesByProfesor.has(windowProfesorId)) {
          changesByProfesor.set(windowProfesorId, []);
        }
        changesByProfesor.get(windowProfesorId).push(change);
      }
    }
  }

  // Enviar notificaciones WebSocket si hay cambios
  if (broadcastChanges && changesByProfesor.size > 0) {
    changesByProfesor.forEach((changes, profesorId) => {
      broadcastStatusUpdate(profesorId, changes);
    });
  }

  console.log(`🎯 Verificación completa. ${updatedWindows.length} ventanas actualizadas`);
  return updatedWindows;
}

// 🚀 Sistema ULTRA-PRECISO de Latencia en Milisegundos
let scheduledTimeouts = new Map<number, { timeout: NodeJS.Timeout, startTime: bigint, targetTime: bigint }>();
let prismaInstance: PrismaClient | null = null;

// Función de timeout de alta precisión con corrección de drift
const preciseSetTimeout = (callback: () => void, delay: number): NodeJS.Timeout => {
  const startTime = process.hrtime.bigint();
  const targetTime = startTime + BigInt(delay * 1000000); // Convertir ms a nanosegundos
  
  const checkTime = () => {
    const currentTime = process.hrtime.bigint();
    const remaining = Number(targetTime - currentTime) / 1000000; // Convertir ns a ms
    
    if (remaining <= 1) { // Si queda 1ms o menos, ejecutar inmediatamente
      callback();
    } else if (remaining < 10) { // Si quedan menos de 10ms, usar setImmediate
      setImmediate(() => {
        const finalTime = process.hrtime.bigint();
        if (finalTime >= targetTime) {
          callback();
        } else {
          setTimeout(callback, Math.max(0, Number(targetTime - finalTime) / 1000000));
        }
      });
    } else {
      // Usar setTimeout con corrección de drift
      setTimeout(checkTime, Math.min(remaining - 5, 100));
    }
  };
  
  return setTimeout(checkTime, Math.max(1, delay - 5));
};

// Función para programar timeout exacto con precisión de milisegundos
const scheduleExactStateChange = async (windowId: number, changeTime: Date, newState: string, profesorId: number) => {
  if (!prismaInstance) return;
  
  const now = Date.now();
  const targetTime = changeTime.getTime();
  const delay = targetTime - now;
  
  // Solo programar si es en el futuro y dentro de las próximas 12 horas
  if (delay > 0 && delay <= 12 * 60 * 60 * 1000) {
    // Cancelar timeout anterior si existe
    const existing = scheduledTimeouts.get(windowId);
    if (existing) {
      clearTimeout(existing.timeout);
    }
    
    const startTime = process.hrtime.bigint();
    const targetTimeNs = startTime + BigInt(delay * 1000000);
    
    console.log(`⏰ PROGRAMANDO cambio ULTRA-PRECISO: Ventana ${windowId} → ${newState} en ${delay}ms`);
    
    // Programar timeout de alta precisión
    const timeout = preciseSetTimeout(async () => {
      const executionTime = process.hrtime.bigint();
      const actualDelay = Number(executionTime - startTime) / 1000000;
      
      try {
        console.log(`🎯 EJECUTANDO cambio (precisión: ${actualDelay.toFixed(2)}ms): Ventana ${windowId} → ${newState}`);
        
        // 🚀 BROADCAST ULTRA-RÁPIDO (antes de BD para latencia mínima)
        const broadcastStart = process.hrtime.bigint();
        broadcastStatusUpdate(profesorId, [{
          id: windowId,
          titulo: `Ventana ${windowId}`, // Título temporal para velocidad
          estadoAnterior: newState === 'en_curso' ? 'programada' : 'en_curso',
          estadoNuevo: newState,
          fechaInicio: changeTime.toISOString(),
          timestamp: Date.now() // Timestamp preciso
        }]);
        const broadcastEnd = process.hrtime.bigint();
        const broadcastLatency = Number(broadcastEnd - broadcastStart) / 1000000;
        console.log(`⚡ Broadcast enviado en ${broadcastLatency.toFixed(2)}ms`);
        
        // Actualizar BD en paralelo (no bloquear WebSocket)
        if (prismaInstance) {
          setImmediate(async () => {
            try {
              await prismaInstance!.examWindow.update({
                where: { id: windowId },
                data: { estado: newState }
              });
              console.log(`💾 BD actualizada para ventana ${windowId}`);
            } catch (error) {
              console.error(`❌ Error BD:`, error);
            }
          });
        }
        
        // Remover timeout
        scheduledTimeouts.delete(windowId);
        
        console.log(`✅ CAMBIO ULTRA-PRECISO completado en ${actualDelay.toFixed(2)}ms`);
      } catch (error) {
        console.error(`❌ Error en cambio programado:`, error);
      }
    }, delay);
    
    scheduledTimeouts.set(windowId, { timeout, startTime, targetTime: targetTimeNs });
  }
};

// Sistema híbrido: Timeouts exactos + Verificador de respaldo ultra-rápido
const startMillisecondSystem = (prisma: PrismaClient) => {
  prismaInstance = prisma;
  console.log('🚀 Iniciando sistema de MILISEGUNDOS (timeouts ultra-precisos)...');
  
  // 1. Programar cambios exactos inmediatamente
  const scheduleUpcomingChanges = async () => {
    try {
      const now = new Date();
      const next12Hours = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      
      // Obtener ventanas que van a cambiar en las próximas 12 horas
      const upcomingWindows = await prisma.examWindow.findMany({
        where: {
          OR: [
            {
              estado: 'programada',
              fechaInicio: {
                gte: now,
                lte: next12Hours
              }
            },
            {
              estado: 'en_curso'
            }
          ]
        },
        include: {
          exam: { select: { profesorId: true } }
        }
      });
      
      for (const window of upcomingWindows) {
        const startDate = new Date(window.fechaInicio);
        const endDate = new Date(startDate.getTime() + window.duracion * 60 * 1000);
        
        // Programar inicio si está programada
        if (window.estado === 'programada' && startDate > now) {
          await scheduleExactStateChange(
            window.id, 
            startDate, 
            'en_curso', 
            (window.exam as any).profesorId
          );
        }
        
        // Programar fin si está en curso o va a empezar
        if (endDate > now) {
          await scheduleExactStateChange(
            window.id, 
            endDate, 
            'finalizada', 
            (window.exam as any).profesorId
          );
        }
      }
      
      console.log(`⚡ Programados ${scheduledTimeouts.size} cambios ultra-precisos (latencia < 10ms)`);
    } catch (error) {
      console.error('❌ Error programando cambios exactos:', error);
    }
  };
  
  // Ejecutar inmediatamente
  scheduleUpcomingChanges();
  
  // 2. Re-programar cambios exactos cada 2 minutos
  setInterval(() => {
    scheduleUpcomingChanges();
  }, 2 * 60 * 1000);
  
  // 3. Verificador de respaldo ultra-rápido cada 5 segundos
  const backupInterval = setInterval(async () => {
    try {
      await updateWindowStatuses(prisma, undefined, false, true);
    } catch (error) {
      console.error('❌ Error en verificador de respaldo:', error);
    }
  }, 5000); // 5 segundos como respaldo ultra-rápido
  
  console.log('✅ Sistema MILISEGUNDOS iniciado:');
  console.log('  ⚡ Cambios exactos: < 10ms de latencia');
  console.log('  🔄 Verificador respaldo: cada 5 segundos');
  console.log('  🔁 Re-programación: cada 2 minutos');
  
  return { backupInterval };
};

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
      // Primero actualizar estados automáticamente y notificar via WebSocket
      await updateWindowStatuses(prisma, req.user!.userId, false, true);
      
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
    // Primero actualizar estados automáticamente y notificar via WebSocket
    await updateWindowStatuses(prisma, undefined, false, true);
    
    const whereClause: any = {
      activa: true,
      estado: {
        in: ['programada', 'cerrada_inscripciones'] // Incluir ventanas programadas Y sin cupo
      },
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
      const updatedWindows = await updateWindowStatuses(prisma, req.user!.userId, true, true);

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

  // 🚀 Inicializar sistema ULTRA-PRECISO de MILISEGUNDOS
  startMillisecondSystem(prisma);

  return router;
};

export default ExamWindowRoute;