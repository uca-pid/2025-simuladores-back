import { type PrismaClient } from "@prisma/client";

/**
 * Resultado de validar que un estudiante esté inscrito en una ventana activa
 * del examen. Devuelve null si todo está en orden, o un error {status, error}
 * listo para responder.
 */
export interface FilesValidationError {
  status: number;
  error: string;
}

/**
 * Verifica que el examen exista y pertenezca al profesor indicado.
 * Devuelve el examen si es válido, o un error {status, error} listo para responder.
 */
export async function validateExamOwnership(
  prisma: PrismaClient,
  examId: number,
  profesorId: number
) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { profesorId: true }
  });

  if (!exam) {
    return { error: { status: 404, error: 'Examen no encontrado' } as FilesValidationError };
  }

  if (exam.profesorId !== profesorId) {
    return {
      error: {
        status: 403,
        error: 'No tienes permisos para ver archivos de este examen',
        code: 'NOT_OWNER'
      } as FilesValidationError & { code?: string }
    };
  }

  return { exam };
}

/**
 * Obtiene los archivos de un estudiante para un examen (uso de profesores).
 */
export async function getStudentFiles(
  prisma: PrismaClient,
  examId: number,
  studentId: number,
  version: string
) {
  return prisma.examFile.findMany({
    where: {
      examId,
      userId: studentId,
      version
    },
    select: {
      id: true,
      filename: true,
      content: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          nombre: true,
          email: true
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
}

/**
 * Verifica que el estudiante esté inscrito en una ventana activa del examen.
 * Devuelve null si todo está en orden, o un error {status, error} listo para responder.
 * No aplica ninguna validación para roles distintos de 'student'.
 */
export async function validateStudentInscription(
  prisma: PrismaClient,
  userId: number,
  userRole: string,
  examId: number
): Promise<FilesValidationError | null> {
  if (userRole !== 'student') {
    return null;
  }

  const inscription = await prisma.inscription.findFirst({
    where: {
      userId,
      examWindow: {
        examId,
        activa: true
      },
      cancelledAt: null
    },
    include: { examWindow: true }
  });

  if (!inscription) {
    return { status: 403, error: 'No estás inscrito en una ventana activa de este examen' };
  }

  return null;
}

/**
 * Obtiene los archivos de un examen para el usuario autenticado en una versión dada.
 */
export async function getFiles(
  prisma: PrismaClient,
  examId: number,
  userId: number,
  version: string
) {
  return prisma.examFile.findMany({
    where: {
      examId,
      userId,
      version
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
}

/**
 * Obtiene un archivo específico de un examen para el usuario autenticado.
 */
export async function getFile(
  prisma: PrismaClient,
  examId: number,
  userId: number,
  filename: string,
  version: string
) {
  return prisma.examFile.findFirst({
    where: {
      examId,
      userId,
      filename,
      version
    }
  });
}

/**
 * Crea o actualiza un archivo del usuario autenticado para un examen (upsert).
 */
export async function saveFile(
  prisma: PrismaClient,
  examId: number,
  userId: number,
  filename: string,
  content: string,
  version: string
) {
  return prisma.examFile.upsert({
    where: {
      examId_userId_filename_version: {
        examId,
        userId,
        filename,
        version
      }
    },
    update: {
      content: content || '',
      updatedAt: new Date()
    },
    create: {
      examId,
      userId,
      filename,
      content: content || '',
      version
    }
  });
}

/**
 * Elimina un archivo del usuario autenticado para un examen. Devuelve el archivo
 * eliminado, o null si no existía.
 */
export async function deleteFile(
  prisma: PrismaClient,
  examId: number,
  userId: number,
  filename: string,
  version: string
) {
  const file = await prisma.examFile.findFirst({
    where: {
      examId,
      userId,
      filename,
      version
    }
  });

  if (!file) {
    return null;
  }

  await prisma.examFile.delete({
    where: { id: file.id }
  });

  return file;
}

/**
 * Guarda múltiples archivos como versión de envío ("submission") para el usuario
 * autenticado, creando o actualizando cada uno según corresponda.
 */
export async function saveSubmissionFiles(
  prisma: PrismaClient,
  examId: number,
  userId: number,
  files: Array<{ filename: string; content?: string }>
) {
  const savedFiles = [];

  for (const fileData of files) {
    const { filename, content } = fileData;

    if (!filename) {
      continue; // Saltar archivos sin nombre
    }

    // Verificar si ya existe el archivo con versión submission
    const existingFile = await prisma.examFile.findFirst({
      where: {
        examId,
        userId,
        filename,
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
          examId,
          userId,
          filename,
          content: content || '',
          version: 'submission'
        }
      });
    }

    savedFiles.push(file);
  }

  return savedFiles;
}

/**
 * Verifica que el examen exista y que el usuario sea el profesor propietario.
 * Devuelve el examen si es válido, o un error {status, error} listo para responder.
 */
export async function validateExamOwnerForReferenceSolution(
  prisma: PrismaClient,
  examId: number,
  userId: number,
  action: 'ver' | 'modificar' | 'eliminar'
) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId }
  });

  if (!exam) {
    return { error: { status: 404, error: 'Examen no encontrado' } as FilesValidationError };
  }

  if (exam.profesorId !== userId) {
    const messages: Record<typeof action, string> = {
      ver: 'No tienes permiso para ver la solución de referencia',
      modificar: 'No tienes permiso para modificar la solución de referencia',
      eliminar: 'No tienes permiso para eliminar archivos de referencia'
    };
    return { error: { status: 403, error: messages[action] } as FilesValidationError };
  }

  return { exam };
}

/**
 * Obtiene los archivos de solución de referencia de un examen.
 */
export async function getReferenceSolutionFiles(
  prisma: PrismaClient,
  examId: number,
  profesorId: number
) {
  return prisma.examFile.findMany({
    where: {
      examId,
      userId: profesorId,
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
}

/**
 * Guarda/actualiza múltiples archivos de solución de referencia para un examen.
 */
export async function saveReferenceSolutionFiles(
  prisma: PrismaClient,
  examId: number,
  profesorId: number,
  files: Array<{ filename: string; content?: string }>
) {
  const savedFiles = [];

  for (const fileData of files) {
    const { filename, content } = fileData;

    if (!filename) {
      continue;
    }

    const file = await prisma.examFile.upsert({
      where: {
        examId_userId_filename_version: {
          examId,
          userId: profesorId,
          filename,
          version: 'reference_solution'
        }
      },
      update: {
        content: content || '',
        updatedAt: new Date()
      },
      create: {
        examId,
        userId: profesorId,
        filename,
        content: content || '',
        version: 'reference_solution'
      }
    });

    savedFiles.push(file);
  }

  return savedFiles;
}

/**
 * Elimina un archivo de solución de referencia. Devuelve el archivo eliminado,
 * o null si no existía.
 */
export async function deleteReferenceSolutionFile(
  prisma: PrismaClient,
  examId: number,
  profesorId: number,
  filename: string
) {
  const file = await prisma.examFile.findFirst({
    where: {
      examId,
      userId: profesorId,
      filename,
      version: 'reference_solution'
    }
  });

  if (!file) {
    return null;
  }

  await prisma.examFile.delete({
    where: { id: file.id }
  });

  return file;
}
