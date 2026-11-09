import { type PrismaClient } from "@prisma/client";

/** Extensión tal como se guarda: attemptId null = para todos los alumnos de la ventana. */
type Extension = { attemptId: number | null; minutos: number };

/** Minutos extra que tiene un intento: las extensiones para todos más las suyas propias. */
export function minutosExtraDeIntento(extensiones: Extension[], attemptId?: number | null): number {
  return extensiones
    .filter(ext => ext.attemptId === null || (attemptId != null && ext.attemptId === attemptId))
    .reduce((total, ext) => total + ext.minutos, 0);
}

/**
 * Minutos extra hasta los que puede seguir abierta la ventana: las extensiones
 * para todos más la mayor extensión individual. La ventana recién se finaliza
 * cuando termina el último alumno; cada intento se sigue controlando con su
 * propio fin (ver minutosExtraDeIntento).
 */
export function minutosExtraDeVentana(extensiones: Extension[]): number {
  const globales = minutosExtraDeIntento(extensiones, null);
  const porIntento = new Map<number, number>();
  for (const ext of extensiones) {
    if (ext.attemptId !== null) {
      porIntento.set(ext.attemptId, (porIntento.get(ext.attemptId) || 0) + ext.minutos);
    }
  }
  const mayorIndividual = Math.max(0, ...porIntento.values());
  return globales + mayorIndividual;
}

/** Fecha de fin de una ventana con tiempo, sumando minutos extra. */
export function finConExtension(
  window: { fechaInicio: Date | null; duracion: number | null },
  minutosExtra: number
): Date {
  const inicio = new Date(window.fechaInicio!);
  return new Date(inicio.getTime() + ((window.duracion! + minutosExtra) * 60 * 1000));
}

/** Minutos extra de un intento (o, sin intento, solo los que valen para todos). */
export async function getMinutosExtra(prisma: PrismaClient, examWindowId: number, attemptId?: number | null) {
  const extensiones = await prisma.examTimeExtension.findMany({
    where: { examWindowId },
    select: { attemptId: true, minutos: true }
  });
  return minutosExtraDeIntento(extensiones, attemptId);
}

/**
 * Estado del tiempo de una ventana para el panel del profesor: fin para todos,
 * alumnos rindiendo con su propio fin, e historial de extensiones.
 */
export async function getTiempoDeVentana(prisma: PrismaClient, examWindowId: number) {
  const window = await prisma.examWindow.findUnique({ where: { id: examWindowId } });
  if (!window || window.sinTiempo || !window.fechaInicio || !window.duracion) {
    return null;
  }

  const extensiones = await prisma.examTimeExtension.findMany({
    where: { examWindowId },
    include: {
      profesor: { select: { nombre: true } },
      attempt: { select: { user: { select: { nombre: true } } } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const intentos = await prisma.examAttempt.findMany({
    where: { examWindowId, estado: 'en_progreso' },
    include: { user: { select: { id: true, nombre: true, email: true } } },
    orderBy: { user: { nombre: 'asc' } }
  });

  const minutosGlobales = minutosExtraDeIntento(extensiones, null);

  return {
    finOriginal: finConExtension(window, 0),
    minutosGlobales,
    finParaTodos: finConExtension(window, minutosGlobales),
    alumnos: intentos.map(intento => {
      const minutosExtra = minutosExtraDeIntento(extensiones, intento.id);
      return {
        attemptId: intento.id,
        alumno: intento.user,
        minutosIndividuales: minutosExtra - minutosGlobales,
        fin: finConExtension(window, minutosExtra)
      };
    }),
    historial: extensiones.map(ext => ({
      id: ext.id,
      minutos: ext.minutos,
      motivo: ext.motivo,
      createdAt: ext.createdAt,
      otorgadoPor: ext.profesor.nombre,
      alumno: ext.attempt?.user.nombre ?? null
    }))
  };
}

export interface ExtensionError {
  status: number;
  error: string;
}

/**
 * Otorga minutos extra en una ventana con tiempo que está en curso: a todos
 * (sin attemptId) o a un intento puntual que todavía esté rindiendo.
 */
export async function otorgarExtension(
  prisma: PrismaClient,
  params: { examWindowId: number; profesorId: number; minutos: number; motivo?: string; attemptId?: number | null }
) {
  const { examWindowId, profesorId, minutos, motivo, attemptId } = params;

  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 600) {
    return { error: { status: 400, error: "Los minutos deben ser un número entero entre 1 y 600" } as ExtensionError };
  }

  const window = await prisma.examWindow.findFirst({
    where: { id: examWindowId, exam: { profesorId } }
  });

  if (!window) {
    return { error: { status: 404, error: "Ventana no encontrada o no tienes permisos" } as ExtensionError };
  }
  if (window.sinTiempo) {
    return { error: { status: 400, error: "Las ventanas sin horario no tienen tiempo para extender" } as ExtensionError };
  }
  if (!window.activa || window.estado !== 'en_curso') {
    return { error: { status: 400, error: "Solo se puede dar más tiempo mientras el examen está en curso" } as ExtensionError };
  }

  if (attemptId != null) {
    const intento = await prisma.examAttempt.findFirst({
      where: { id: attemptId, examWindowId }
    });
    if (!intento) {
      return { error: { status: 404, error: "El alumno no está rindiendo en esta ventana" } as ExtensionError };
    }
    if (intento.estado !== 'en_progreso') {
      return { error: { status: 400, error: "El alumno ya entregó el examen" } as ExtensionError };
    }
  }

  const extension = await prisma.examTimeExtension.create({
    data: {
      examWindowId,
      attemptId: attemptId ?? null,
      minutos,
      motivo: motivo?.trim() || null,
      otorgadoPor: profesorId
    }
  });

  return { extension };
}
