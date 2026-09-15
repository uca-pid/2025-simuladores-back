import { type PrismaClient } from "@prisma/client";

/**
 * Parsea un string de fecha/hora (con o sin separador 'T') como hora local.
 */
export function parseLocalDate(dateString: string): Date {
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
export function parseFiltroFecha(dateString: string): Date {
  if (!dateString) throw new Error("No se recibió fecha válida");

  // Solo consideramos la parte de fecha, ignorando hora si existe
  const [fecha] = dateString.split("T");
  const [year, month, day] = fecha.split("-").map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

// Función auxiliar para actualizar estados automáticamente
export async function updateWindowStatuses(
  prisma: PrismaClient,
  profesorId?: number,
  returnChanges = false,
  broadcastChanges = false
) {
  const now = new Date();

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
    // Saltar ventanas sin tiempo - no tienen transiciones automáticas
    if (window.sinTiempo) {
      continue;
    }

    // Solo procesar ventanas con tiempo
    if (!window.fechaInicio || !window.duracion) {
      continue;
    }

    const startDate = new Date(window.fechaInicio!);
    const endDate = new Date(startDate.getTime() + (window.duracion! * 60 * 1000));
    let newStatus = window.estado;
    let shouldUpdate = false;

    // Lógica de transición automática
    if (now >= startDate && now <= endDate && window.estado !== 'en_curso' && window.estado !== 'finalizada') {
      newStatus = 'en_curso';
      shouldUpdate = true;
    } else if (now > endDate && window.estado !== 'finalizada') {
      newStatus = 'finalizada';
      shouldUpdate = true;
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

      // Agrupar cambios por profesor
      if (broadcastChanges) {
        const windowProfesorId = (window as any).exam.profesorId;
        if (!changesByProfesor.has(windowProfesorId)) {
          changesByProfesor.set(windowProfesorId, []);
        }
        changesByProfesor.get(windowProfesorId).push(change);
      }
    }
  }

  // Notificaciones WebSocket eliminadas - los cambios se reflejan al refrescar

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

    // Programar timeout de alta precisión
    const timeout = preciseSetTimeout(async () => {
      const executionTime = process.hrtime.bigint();
      const actualDelay = Number(executionTime - startTime) / 1000000;

      try {
        // Broadcast WebSocket eliminado - cambios de estado se reflejan al refrescar

        // Actualizar BD en paralelo
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
      } catch (error) {
        console.error(`❌ Error en cambio programado:`, error);
      }
    }, delay);

    scheduledTimeouts.set(windowId, { timeout, startTime, targetTime: targetTimeNs });
  }
};

// Sistema híbrido: Timeouts exactos + Verificador de respaldo ultra-rápido
export const startMillisecondSystem = (prisma: PrismaClient) => {
  prismaInstance = prisma;

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

  return { backupInterval };
};
