import { type PrismaClient } from "@prisma/client";
import { readFile } from "fs/promises";
import path from "path";
import CodeExecutionService from "./codeExecution.service.ts";

/**
 * Lee del disco todos los archivos de dataset asociados a un examen (si tiene),
 * para poder dejarlos junto al código durante la ejecución (ver
 * CodeExecutionService.executeCode / DatasetFile). Soporta tanto el array
 * nuevo `datasetFiles` como, por compatibilidad con exámenes creados antes de
 * esta función, el par legacy `datasetCsvUrl`/`datasetCsvNombre` (un solo archivo).
 */
export async function loadExamDatasets(exam: {
  datasetFiles?: unknown;
  datasetCsvUrl?: string | null;
  datasetCsvNombre?: string | null;
}) {
  const entries: Array<{ url: string; nombre: string }> =
    Array.isArray(exam.datasetFiles) ? (exam.datasetFiles as any[]) : [];

  const allEntries = entries.length > 0
    ? entries
    : (exam.datasetCsvUrl && exam.datasetCsvNombre
      ? [{ url: exam.datasetCsvUrl, nombre: exam.datasetCsvNombre }]
      : []);

  const datasets = await Promise.all(
    allEntries.map(async ({ url, nombre }) => {
      try {
        const filePath = path.join(process.cwd(), url.replace(/^\/+/, ""));
        const content = await readFile(filePath, "utf-8");
        return { name: nombre, content };
      } catch (err) {
        console.error(`No se pudo leer el dataset "${nombre}" del examen:`, err);
        return null;
      }
    })
  );

  return datasets.filter((d): d is { name: string; content: string } => d !== null);
}

/**
 * Resultado de validar acceso/propiedad sobre un examen. Devuelve null si todo
 * está en orden, o un error {status, error} listo para responder.
 */
export interface ExamValidationError {
  status: number;
  error: string;
  code?: string;
  [key: string]: any;
}

/**
 * Crea un nuevo examen (multiple choice o programación) y, si corresponde,
 * guarda los archivos de solución de referencia asociados.
 */
export async function createExam(
  prisma: PrismaClient,
  body: any,
  profesorId: number
) {
  const {
    titulo,
    preguntas,
    tipo = 'multiple_choice',
    ordenAleatorio = false,
    lenguajeProgramacion,
    intellisenseHabilitado = false,
    enunciadoTipo = 'texto',
    enunciadoProgramacion,
    enunciadoUrl,
    enunciadoArchivoNombre,
    datasetFiles,
    codigoInicial,
    testCases,
    solucionReferencia,
    referenceFiles // Array de archivos de referencia
  } = body;

  // Validar campos según el tipo de examen
  if (tipo === 'programming') {
    if (!lenguajeProgramacion || !['python', 'javascript'].includes(lenguajeProgramacion)) {
      return {
        error: {
          status: 400,
          error: "Para exámenes de programación se requiere especificar el lenguaje (python o javascript)"
        } as ExamValidationError
      };
    }
    if (!['texto', 'archivo'].includes(enunciadoTipo)) {
      return {
        error: {
          status: 400,
          error: "enunciadoTipo debe ser 'texto' o 'archivo'"
        } as ExamValidationError
      };
    }
    if (enunciadoTipo === 'texto' && !enunciadoProgramacion) {
      return {
        error: {
          status: 400,
          error: "Para exámenes de programación se requiere especificar el enunciado"
        } as ExamValidationError
      };
    }
    if (enunciadoTipo === 'archivo' && !enunciadoUrl) {
      return {
        error: {
          status: 400,
          error: "Para exámenes de programación con consigna en archivo se requiere subir el archivo"
        } as ExamValidationError
      };
    }
  } else if (tipo === 'multiple_choice') {
    if (!preguntas || preguntas.length === 0) {
      return {
        error: {
          status: 400,
          error: "Para exámenes de multiple choice se requieren preguntas"
        } as ExamValidationError
      };
    }
  }

  const examData: any = {
    titulo,
    tipo,
    ordenAleatorio,
    profesorId,
  };

  // Agregar campos específicos según el tipo
  if (tipo === 'programming') {
    examData.lenguajeProgramacion = lenguajeProgramacion;
    examData.intellisenseHabilitado = intellisenseHabilitado;
    examData.enunciadoTipo = enunciadoTipo;
    // Mutuamente excluyentes: solo se persiste el campo correspondiente al tipo elegido.
    examData.enunciadoProgramacion = enunciadoTipo === 'texto' ? enunciadoProgramacion : null;
    examData.enunciadoUrl = enunciadoTipo === 'archivo' ? enunciadoUrl : null;
    examData.enunciadoArchivoNombre = enunciadoTipo === 'archivo' ? (enunciadoArchivoNombre || null) : null;
    // Los datasets son independientes del tipo de consigna (texto o archivo).
    // Se guarda como array de { url, nombre }; los campos legacy datasetCsvUrl/
    // datasetCsvNombre quedan sin usar para exámenes nuevos (se leen igual para
    // exámenes viejos vía loadExamDatasets).
    examData.datasetFiles = Array.isArray(datasetFiles) && datasetFiles.length > 0
      ? datasetFiles.filter((f: any) => f?.url && f?.nombre)
      : null;
    examData.codigoInicial = codigoInicial || '';
    examData.testCases = testCases || [];
    examData.solucionReferencia = solucionReferencia || null;
  } else if (tipo === 'multiple_choice' && preguntas) {
    examData.preguntas = {
      create: preguntas.map((p: any) => ({
        tipo: p.tipo || 'multiple_choice',
        texto: p.texto,
        correcta: p.correcta,
        opciones: p.opciones,
      })),
    };
  }

  const examen = await prisma.exam.create({
    data: examData,
    include: { preguntas: true },
  });

  // Guardar archivos de referencia si existen (solo para exámenes de programación)
  if (tipo === 'programming' && referenceFiles && Array.isArray(referenceFiles) && referenceFiles.length > 0) {
    // Filtrar archivos que tengan contenido
    const filesWithContent = referenceFiles.filter((f: any) => f.filename && f.content && f.content.trim());

    if (filesWithContent.length > 0) {
      // Guardar cada archivo en la tabla ExamFile
      await Promise.all(filesWithContent.map((file: any) =>
        prisma.examFile.upsert({
          where: {
            examId_userId_filename_version: {
              examId: examen.id,
              userId: profesorId,
              filename: file.filename,
              version: 'reference_solution'
            }
          },
          update: {
            content: file.content,
            updatedAt: new Date()
          },
          create: {
            examId: examen.id,
            userId: profesorId,
            filename: file.filename,
            content: file.content,
            version: 'reference_solution'
          }
        })
      ));
    }
  }

  return { exam: examen };
}

/**
 * Obtiene la lista de exámenes visibles para el usuario autenticado: los
 * propios para profesores, o los de un profesor indicado (o todos) para
 * usuarios de sistema.
 */
export async function getExamsForUser(
  prisma: PrismaClient,
  userRole: string,
  userId: number,
  queryProfesorId: unknown
) {
  let profesorId: number;

  if (userRole === 'professor') {
    // Professors can only see their own exams
    profesorId = userId;
  } else if (userRole === 'system') {
    // System users can specify profesorId in query, or get all exams
    if (queryProfesorId) {
      profesorId = Number(queryProfesorId);
      if (isNaN(profesorId)) {
        return { error: { status: 400, error: "ProfesorId inválido" } as ExamValidationError };
      }
    } else {
      // Get all exams for system users
      const exams = await prisma.exam.findMany({
        include: { preguntas: true, profesor: { select: { nombre: true, email: true } } },
      });
      return { exams };
    }
  } else {
    return { error: { status: 403, error: "No tienes permisos para ver exámenes" } as ExamValidationError };
  }

  const exams = await prisma.exam.findMany({
    where: { profesorId },
    include: { preguntas: true },
  });

  return { exams };
}

/**
 * Obtiene un examen por id, validando propiedad para profesores e inscripción
 * en ventana activa para estudiantes. Sanitiza la respuesta según el rol.
 */
export async function getExamById(
  prisma: PrismaClient,
  examId: number,
  windowId: number | null,
  userRole: string,
  userId: number
) {
  // 🔒 VALIDACIÓN DE SEGURIDAD PARA PROFESORES
  // Verificar que el profesor sea dueño del examen o que sea estudiante inscrito
  if (userRole === 'professor') {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { profesorId: true }
    });

    if (!exam) {
      return { error: { status: 404, error: "Examen no encontrado" } as ExamValidationError };
    }

    // Solo el profesor dueño puede ver su examen
    if (exam.profesorId !== userId) {
      return {
        error: {
          status: 403,
          error: "No tienes permisos para acceder a este examen",
          code: "NOT_OWNER"
        } as ExamValidationError
      };
    }
  }

  // 🔒 VALIDACIÓN DE SEGURIDAD PARA ESTUDIANTES
  if (userRole === 'student') {
    // Requiere windowId para estudiantes
    if (!windowId) {
      return {
        error: {
          status: 400,
          error: "Se requiere windowId para acceder al examen",
          code: "WINDOW_ID_REQUIRED"
        } as ExamValidationError
      };
    }

    // Verificar inscripción y permisos
    const inscription = await prisma.inscription.findFirst({
      where: {
        userId,
        examWindowId: windowId
      },
      include: {
        examWindow: true
      }
    });

    if (!inscription) {
      return {
        error: {
          status: 403,
          error: "No estás inscrito en esta ventana de examen",
          code: "NOT_ENROLLED"
        } as ExamValidationError
      };
    }

    // Verificar que el examen de la ventana coincida con el solicitado
    if (inscription.examWindow.examId !== examId) {
      return {
        error: {
          status: 403,
          error: "La ventana no corresponde a este examen",
          code: "EXAM_MISMATCH"
        } as ExamValidationError
      };
    }

    // Verificar que la ventana esté activa
    if (!inscription.examWindow.activa) {
      return {
        error: {
          status: 403,
          error: "Esta ventana de examen ha sido desactivada por el profesor",
          code: "WINDOW_DEACTIVATED"
        } as ExamValidationError
      };
    }

    // Verificar disponibilidad del examen
    if (inscription.examWindow.sinTiempo) {

    } else {
      // Para ventanas con tiempo, verificar estado y tiempo
      const now = new Date();
      const startDate = new Date(inscription.examWindow.fechaInicio!);
      const endDate = new Date(startDate.getTime() + (inscription.examWindow.duracion! * 60 * 1000));

      if (inscription.examWindow.estado !== 'en_curso' || now < startDate || now > endDate) {
        return {
          error: {
            status: 403,
            error: "El examen no está disponible en este momento",
            code: "EXAM_NOT_AVAILABLE",
            estado: inscription.examWindow.estado,
            fechaInicio: inscription.examWindow.fechaInicio,
            fechaFin: endDate
          } as ExamValidationError
        };
      }
    }
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { preguntas: true },
  });

  if (!exam) {
    return { error: { status: 404, error: "Examen no encontrado" } as ExamValidationError };
  }

  // Auto-register history for students
  if (userRole === 'student') {
    await prisma.examHistory.upsert({
      where: { userId_examId: { userId, examId } },
      update: { viewedAt: new Date() },
      create: { userId, examId },
    });

    // 🔒 SEGURIDAD: NO enviar respuestas correctas ni datos de test cases
    const sanitizedExam: any = { ...exam };

    // Eliminar respuestas correctas de preguntas (EXCEPTO para matching y fill_in_blank)
    // Para matching y fill_in_blank, 'correcta' indica la CANTIDAD de elementos, no la respuesta
    if (sanitizedExam.preguntas) {
      sanitizedExam.preguntas = sanitizedExam.preguntas.map((pregunta: any) => {
        // Para matching y fill_in_blank, mantener 'correcta' porque indica cantidad de conceptos/respuestas
        if (pregunta.tipo === 'matching' || pregunta.tipo === 'fill_in_blank') {
          return pregunta;
        }
        // Para otros tipos (multiple_choice, true_false), eliminar 'correcta'
        const { correcta, ...preguntaSinRespuesta } = pregunta;
        return preguntaSinRespuesta;
      });
    }

    // Sanitizar test cases (solo enviar descripción, no expectedOutput ni input)
    if (sanitizedExam.testCases && Array.isArray(sanitizedExam.testCases)) {
      sanitizedExam.testCases = sanitizedExam.testCases.map((tc: any) => ({
        description: tc.description || 'Test case'
        // NO enviar expectedOutput, input ni otros datos
      }));
    }

    return { exam: sanitizedExam };
  }

  // 🔒 Validación de propiedad para profesores
  if (userRole === 'professor' && exam.profesorId !== userId) {
    return { error: { status: 403, error: "No tienes permiso para ver este examen" } as ExamValidationError };
  }

  // Ocultar solución de referencia si no es el profesor dueño
  const examResponse: any = { ...exam };
  if (exam.profesorId !== userId) {
    delete examResponse.solucionReferencia;
  }

  return { exam: examResponse };
}

/**
 * Verifica que el examen exista y pertenezca al profesor indicado.
 * Devuelve el examen si es válido, o un error {status, error} listo para responder.
 */
export async function validateExamOwnership(
  prisma: PrismaClient,
  examId: number,
  profesorId: number,
  forbiddenMessage: string
) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId }
  });

  if (!exam) {
    return { error: { status: 404, error: "Examen no encontrado" } as ExamValidationError };
  }

  if (exam.profesorId !== profesorId) {
    return { error: { status: 403, error: forbiddenMessage } as ExamValidationError };
  }

  return { exam };
}

/**
 * Ejecuta los test cases de un examen de programación contra el código
 * indicado o contra la solución de referencia guardada.
 */
export async function testSolution(
  prisma: PrismaClient,
  codeExecutionService: CodeExecutionService,
  examId: number,
  profesorId: number,
  code: string | undefined,
  useReferenceSolution: boolean
) {
  // Verificar que el examen existe y pertenece al profesor
  const ownership = await validateExamOwnership(
    prisma,
    examId,
    profesorId,
    "No tienes permiso para ejecutar tests en este examen"
  );
  if (ownership.error) {
    return { error: ownership.error };
  }

  const exam = ownership.exam!;

  if (exam.tipo !== 'programming') {
    return { error: { status: 400, error: "Este examen no es de tipo programación" } as ExamValidationError };
  }

  if (!exam.testCases || !Array.isArray(exam.testCases) || exam.testCases.length === 0) {
    return { error: { status: 400, error: "El examen no tiene test cases configurados" } as ExamValidationError };
  }

  // Determinar qué código ejecutar
  let codeToExecute: string;

  if (useReferenceSolution) {
    if (!exam.solucionReferencia) {
      return { error: { status: 400, error: "El examen no tiene una solución de referencia guardada" } as ExamValidationError };
    }
    codeToExecute = exam.solucionReferencia;
  } else {
    if (!code) {
      return { error: { status: 400, error: "Debe proporcionar código para ejecutar" } as ExamValidationError };
    }
    codeToExecute = code;
  }

  // Ejecutar los tests
  const datasets = await loadExamDatasets(exam);
  const testResults = await codeExecutionService.runTests(
    codeToExecute,
    exam.lenguajeProgramacion as 'python' | 'javascript',
    exam.testCases as any[],
    { timeout: 10000, datasets }
  );

  return { testResults };
}

/**
 * Ejecuta tests contra código durante la creación del examen (sin examen guardado).
 */
export async function testSolutionPreview(
  codeExecutionService: CodeExecutionService,
  code: string,
  language: string,
  testCases: any[]
) {
  const testResults = await codeExecutionService.runTests(
    code,
    language as 'python' | 'javascript',
    testCases,
    { timeout: 10000 }
  );

  return testResults;
}

/**
 * Guarda o actualiza la solución de referencia de un examen de programación.
 */
export async function saveReferenceSolution(
  prisma: PrismaClient,
  examId: number,
  profesorId: number,
  solucionReferencia: string
) {
  // Verificar que el examen existe y pertenece al profesor
  const ownership = await validateExamOwnership(
    prisma,
    examId,
    profesorId,
    "No tienes permiso para modificar este examen"
  );
  if (ownership.error) {
    return { error: ownership.error };
  }

  const exam = ownership.exam!;

  if (exam.tipo !== 'programming') {
    return { error: { status: 400, error: "Este examen no es de tipo programación" } as ExamValidationError };
  }

  // Actualizar la solución de referencia
  const updatedExam = await prisma.exam.update({
    where: { id: examId },
    data: { solucionReferencia }
  });

  return { exam: updatedExam };
}
