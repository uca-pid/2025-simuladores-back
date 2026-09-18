import { PrismaClient } from "@prisma/client";

export class ExamTimeExtensionService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Otorga tiempo extra a TODOS los alumnos de una ventana
   */
  async grantGlobalExtension(params: {
    examWindowId: number;
    minutos: number;
    otorgadoPor: number;
    motivo?: string;
  }) {
    return this.prisma.examTimeExtension.create({
      data: {
        examWindowId: params.examWindowId,
        attemptId: null, // null indica que es para todos en la ventana
        minutos: params.minutos,
        otorgadoPor: params.otorgadoPor,
        motivo: params.motivo || "Extensión global para toda la ventana"
      }
    });
  }

  /**
   * Otorga tiempo extra a UN alumno individual (su intento activo)
   */
  async grantIndividualExtension(params: {
    examWindowId: number;
    attemptId: number;
    minutos: number;
    otorgadoPor: number;
    motivo?: string;
  }) {
    return this.prisma.examTimeExtension.create({
      data: {
        examWindowId: params.examWindowId,
        attemptId: params.attemptId,
        minutos: params.minutos,
        otorgadoPor: params.otorgadoPor,
        motivo: params.motivo || "Extensión de tiempo individual"
      }
    });
  }

  /**
   * Calcula el total de minutos extras acumulados para un intento específico
   * (Suma las extensiones globales + las individuales de ese intento)
   */
  async getTotalExtraMinutes(examWindowId: number, attemptId?: number): Promise<number> {
    const result = await this.prisma.examTimeExtension.aggregate({
      _sum: { minutos: true },
      where: {
        examWindowId,
        OR: [
          { attemptId: null },                // Extensiones para todos
          attemptId ? { attemptId } : {}      // Extensiones individuales
        ]
      }
    });

    return result._sum.minutos || 0;
  }

  /**
   * Obtiene el historial de auditoría de extensiones de tiempo de una ventana
   */
  async getAuditHistory(examWindowId: number) {
    return this.prisma.examTimeExtension.findMany({
      where: { examWindowId },
      include: {
        profesor: { select: { id: true, nombre: true, email: true } },
        attempt: { include: { user: { select: { id: true, nombre: true, email: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
