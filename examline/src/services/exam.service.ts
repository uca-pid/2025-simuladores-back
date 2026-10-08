import { type PrismaClient } from "@prisma/client";
import { readFile } from "fs/promises";
import path from "path";
import CodeExecutionService from "./codeExecution.service.ts";

/**
 * Descarga todos los archivos de dataset asociados a un examen (si tiene),
 * para poder dejarlos junto al código durante la ejecución (ver
 * CodeExecutionService.executeCode / DatasetFile). Soporta tanto el array
 * nuevo `datasetFiles` como, por compatibilidad con exámenes creados antes de
 * esta función, el par legacy `datasetCsvUrl`/`datasetCsvNombre` (un solo archivo).
 * Las urls pueden ser absolutas (Cloudinary) o rutas relativas heredadas de
 * cuando los archivos se guardaban en disco local.
 */
export async function loadExamDatasets(part: {
  datasetFiles?: unknown;
  datasetCsvUrl?: string | null;
  datasetCsvNombre?: string | null;
}) {
  const exam = part;
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
        let content: string;
        if (/^https?:\/\//i.test(url)) {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          content = await response.text();
        } else {
          const filePath = path.join(process.cwd(), url.replace(/^\/+/, ""));
          content = await readFile(filePath, "utf-8");
        }
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
 * Valida una parte del examen (multiple choice o programación) según su tipo.
 * Devuelve un ExamValidationError si algo es inválido, o null si está ok.
 */
export const TIPOS_PREGUNTA_TEORICA = [
  'multiple_choice', 'multiple_response', 'true_false', 'fill_in_blank', 'matching',
  'short_answer', 'numeric', 'essay', 'file_upload'
];
const DIFICULTADES = ['facil', 'media', 'dificil'];

function validatePregunta(pregunta: any, partIndex: number, pIndex: number): ExamValidationError | null {
  const { tipo = 'multiple_choice', dificultad = 'media', texto } = pregunta;

  if (!texto || !String(texto).trim()) {
    return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: el texto es requerido` };
  }
  if (!TIPOS_PREGUNTA_TEORICA.includes(tipo)) {
    return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: tipo de pregunta inválido` };
  }
  if (!DIFICULTADES.includes(dificultad)) {
    return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: dificultad debe ser 'facil', 'media' o 'dificil'` };
  }
  if (pregunta.puntos !== undefined && (isNaN(Number(pregunta.puntos)) || Number(pregunta.puntos) <= 0)) {
    return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: el puntaje debe ser un número mayor a 0` };
  }
  if (tipo === 'numeric') {
    const [valorCorrecto, tolerancia] = Array.isArray(pregunta.opciones) ? pregunta.opciones : [];
    if (valorCorrecto === undefined || valorCorrecto === '' || isNaN(Number(valorCorrecto))) {
      return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: se requiere un valor numérico correcto` };
    }
    if (tolerancia !== undefined && tolerancia !== '' && isNaN(Number(tolerancia))) {
      return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: la tolerancia debe ser numérica` };
    }
  }
  if (tipo === 'short_answer') {
    if (!Array.isArray(pregunta.opciones) || pregunta.opciones.length === 0 || pregunta.opciones.every((o: string) => !o?.trim())) {
      return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: se requiere al menos una respuesta aceptada` };
    }
  }
  if (tipo === 'multiple_response') {
    if (!Array.isArray(pregunta.opciones) || pregunta.opciones.length < 2) {
      return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: se requieren al menos 2 opciones` };
    }
    if (!Array.isArray(pregunta.correctas) || pregunta.correctas.length === 0) {
      return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: se requiere marcar al menos una opción correcta` };
    }
    const fueraDeRango = pregunta.correctas.some((i: number) => i < 0 || i >= pregunta.opciones.length);
    if (fueraDeRango) {
      return { status: 400, error: `Parte ${partIndex + 1}, pregunta ${pIndex + 1}: hay índices de respuesta correcta inválidos` };
    }
  }

  return null;
}

function validatePart(parte: any, index: number): ExamValidationError | null {
  const {
    tipo,
    lenguajeProgramacion,
    enunciadoTipo = 'texto',
    enunciadoProgramacion,
    enunciadoUrl,
    preguntas,
    testCases,
    cantidadFaciles,
    cantidadMedias,
    cantidadDificiles,
  } = parte;

  if (!['multiple_choice', 'programming'].includes(tipo)) {
    return { status: 400, error: `Parte ${index + 1}: tipo debe ser 'multiple_choice' o 'programming'` };
  }

  if (tipo === 'programming') {
    if (!lenguajeProgramacion || !['python', 'javascript', 'c'].includes(lenguajeProgramacion)) {
      return { status: 400, error: `Parte ${index + 1}: se requiere especificar el lenguaje (python, javascript o c)` };
    }
    if (!['texto', 'archivo'].includes(enunciadoTipo)) {
      return { status: 400, error: `Parte ${index + 1}: enunciadoTipo debe ser 'texto' o 'archivo'` };
    }
    if (enunciadoTipo === 'texto' && !enunciadoProgramacion) {
      return { status: 400, error: `Parte ${index + 1}: se requiere especificar el enunciado` };
    }
    if (enunciadoTipo === 'archivo' && !enunciadoUrl) {
      return { status: 400, error: `Parte ${index + 1}: se requiere subir el archivo de consigna` };
    }

    // Sin al menos un test case con output esperado, el auto-grading de esta
    // parte queda roto para todos los alumnos (compararía contra "").
    const testCasesValidos = Array.isArray(testCases)
      ? testCases.filter((tc: any) => tc?.expectedOutput && String(tc.expectedOutput).trim())
      : [];
    if (testCasesValidos.length === 0) {
      return { status: 400, error: `Parte ${index + 1}: se requiere al menos un test case con el output esperado completo` };
    }
  } else if (tipo === 'multiple_choice') {
    if (!preguntas || preguntas.length === 0) {
      return { status: 400, error: `Parte ${index + 1}: se requieren preguntas` };
    }

    for (let pIndex = 0; pIndex < preguntas.length; pIndex++) {
      const preguntaError = validatePregunta(preguntas[pIndex], index, pIndex);
      if (preguntaError) return preguntaError;
    }

    // Pool aleatorio balanceado por dificultad: si se definió alguna cantidad, deben
    // definirse las 3 (0 es válido para "ninguna de ese nivel") y alcanzar con el pool.
    const poolDefinido = [cantidadFaciles, cantidadMedias, cantidadDificiles].some(c => c !== undefined && c !== null);
    if (poolDefinido) {
      const counts = { facil: 0, media: 0, dificil: 0 } as Record<string, number>;
      for (const p of preguntas) counts[p.dificultad || 'media']++;

      const pedidos: Array<[string, number | undefined]> = [
        ['facil', cantidadFaciles], ['media', cantidadMedias], ['dificil', cantidadDificiles]
      ];
      for (const [nivel, cantidad] of pedidos) {
        const n = cantidad ?? 0;
        if (n < 0) {
          return { status: 400, error: `Parte ${index + 1}: la cantidad a sortear de ${nivel} no puede ser negativa` };
        }
        if (n > counts[nivel]) {
          return { status: 400, error: `Parte ${index + 1}: pediste sortear ${n} pregunta(s) de dificultad '${nivel}' pero el pool solo tiene ${counts[nivel]}` };
        }
      }
    }
  }

  return null;
}

/**
 * Crea un nuevo examen compuesto por una o más partes (multiple choice y/o
 * programación), cada una con sus propias preguntas/consigna/test cases.
 * Exam + ExamParts + Preguntas se crean atómicamente en una transacción.
 */
export async function createExam(
  prisma: PrismaClient,
  body: any,
  profesorId: number
) {
  const {
    titulo,
    ordenAleatorio = false,
    partes,
    referenceFiles // Array de archivos de referencia (legacy, aplicado al examen completo)
  } = body;

  if (!titulo || !titulo.trim()) {
    return { error: { status: 400, error: "El título es requerido" } as ExamValidationError };
  }

  if (!Array.isArray(partes) || partes.length === 0) {
    return { error: { status: 400, error: "Se requiere al menos una parte (partes)" } as ExamValidationError };
  }

  for (let i = 0; i < partes.length; i++) {
    const validationError = validatePart(partes[i], i);
    if (validationError) {
      return { error: validationError };
    }
  }

  // Tipo legacy/resumen del examen: si es una sola parte, se refleja su tipo;
  // si son varias, se marca como 'multiple_choice' por defecto (campo ya no se
  // usa para lógica de negocio, solo se mantiene por compatibilidad).
  const legacyTipo = partes.length === 1 ? partes[0].tipo : 'multiple_choice';

  const examen = await prisma.$transaction(async (tx) => {
    const created = await tx.exam.create({
      data: {
        titulo,
        tipo: legacyTipo,
        ordenAleatorio,
        profesorId,
      }
    });

    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      const orden = parte.orden ?? i + 1;
      const partData: any = {
        examId: created.id,
        orden,
        tipo: parte.tipo,
      };

      if (parte.tipo === 'programming') {
        partData.lenguajeProgramacion = parte.lenguajeProgramacion;
        partData.intellisenseHabilitado = !!parte.intellisenseHabilitado;
        partData.enunciadoTipo = parte.enunciadoTipo || 'texto';
        partData.enunciadoProgramacion = partData.enunciadoTipo === 'texto' ? parte.enunciadoProgramacion : null;
        partData.enunciadoUrl = partData.enunciadoTipo === 'archivo' ? parte.enunciadoUrl : null;
        partData.enunciadoArchivoNombre = partData.enunciadoTipo === 'archivo' ? (parte.enunciadoArchivoNombre || null) : null;
        partData.datasetFiles = Array.isArray(parte.datasetFiles) && parte.datasetFiles.length > 0
          ? parte.datasetFiles.filter((f: any) => f?.url && f?.nombre)
          : null;
        partData.codigoInicial = parte.codigoInicial || '';
        partData.testCases = parte.testCases || [];
        partData.solucionReferencia = parte.solucionReferencia || null;
      } else if (parte.tipo === 'multiple_choice') {
        const poolDefinido = [parte.cantidadFaciles, parte.cantidadMedias, parte.cantidadDificiles]
          .some(c => c !== undefined && c !== null);
        if (poolDefinido) {
          partData.cantidadFaciles = parte.cantidadFaciles ?? 0;
          partData.cantidadMedias = parte.cantidadMedias ?? 0;
          partData.cantidadDificiles = parte.cantidadDificiles ?? 0;
        }
      }

      const createdPart = await tx.examPart.create({ data: partData });

      if (parte.tipo === 'multiple_choice' && Array.isArray(parte.preguntas)) {
        await tx.pregunta.createMany({
          data: parte.preguntas.map((p: any, pIndex: number) => ({
            partId: createdPart.id,
            tipo: p.tipo || 'multiple_choice',
            dificultad: p.dificultad || 'media',
            texto: p.texto,
            correcta: p.correcta ?? null,
            correctas: p.correctas ?? null,
            puntos: p.puntos ?? 1,
            opciones: p.opciones ?? [],
            orden: p.orden ?? pIndex + 1,
            imagenUrl: p.imagenUrl || null,
          }))
        });
      }
    }

    return tx.exam.findUniqueOrThrow({
      where: { id: created.id },
      include: { partes: { include: { preguntas: true }, orderBy: { orden: 'asc' } } }
    });
  });

  // Guardar archivos de referencia si existen (solo para exámenes de programación)
  if (referenceFiles && Array.isArray(referenceFiles) && referenceFiles.length > 0) {
    const filesWithContent = referenceFiles.filter((f: any) => f.filename && f.content && f.content.trim());

    if (filesWithContent.length > 0) {
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
        where: { eliminado: false },
        include: {
          partes: { include: { preguntas: true }, orderBy: { orden: 'asc' } },
          profesor: { select: { nombre: true, email: true } }
        },
      });
      return { exams };
    }
  } else {
    return { error: { status: 403, error: "No tienes permisos para ver exámenes" } as ExamValidationError };
  }

  const exams = await prisma.exam.findMany({
    where: { profesorId, eliminado: false },
    include: { partes: { include: { preguntas: true }, orderBy: { orden: 'asc' } } },
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
    include: { partes: { include: { preguntas: true }, orderBy: { orden: 'asc' } } },
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

    // Un estudiante nunca debe recibir las preguntas de partes que no sean la
    // parte en curso de su intento: solo se sanitiza/expone la parte actual
    // (basado en currentPartIndex del intento, server-authoritative).
    const attempt = await prisma.examAttempt.findFirst({
      where: { userId, examId, examWindowId: windowId ?? null }
    });
    const currentPartIndex = attempt?.currentPartIndex ?? 0;

    const sanitizedExam: any = { ...exam };
    sanitizedExam.currentPartIndex = currentPartIndex;
    sanitizedExam.partStatus = attempt?.partStatus ?? 'en_curso';

    sanitizedExam.partes = exam.partes.map((parte: any, idx: number) => {
      const { solucionReferencia, ...parteSinSolucion } = parte;

      if (idx !== currentPartIndex) {
        // Otras partes: no exponer preguntas ni test cases al estudiante
        const { preguntas, testCases, ...rest } = parteSinSolucion;
        return { ...rest, preguntas: [], testCases: undefined };
      }

      // 🔒 SEGURIDAD: NO enviar respuestas correctas ni datos de test cases de la parte actual
      const preguntas = Array.isArray(parteSinSolucion.preguntas)
        ? parteSinSolucion.preguntas.map((pregunta: any) => {
            // Para matching y fill_in_blank, 'correcta' indica cantidad, no la respuesta
            if (pregunta.tipo === 'matching' || pregunta.tipo === 'fill_in_blank') {
              return pregunta;
            }
            const { correcta, ...preguntaSinRespuesta } = pregunta;
            return preguntaSinRespuesta;
          })
        : [];

      const testCases = Array.isArray(parteSinSolucion.testCases)
        ? parteSinSolucion.testCases.map((tc: any) => ({ description: tc.description || 'Test case' }))
        : parteSinSolucion.testCases;

      return { ...parteSinSolucion, preguntas, testCases };
    });

    return { exam: sanitizedExam };
  }

  // 🔒 Validación de propiedad para profesores
  if (userRole === 'professor' && exam.profesorId !== userId) {
    return { error: { status: 403, error: "No tienes permiso para ver este examen" } as ExamValidationError };
  }

  // Ocultar solución de referencia si no es el profesor dueño
  const examResponse: any = { ...exam };
  if (exam.profesorId !== userId) {
    examResponse.partes = exam.partes.map((p: any) => {
      const { solucionReferencia, ...rest } = p;
      return rest;
    });
  }

  return { exam: examResponse };
}

/**
 * Marca un examen como eliminado (soft-delete). Nunca borra la fila realmente,
 * para preservar el historial de intentos/ventanas ya existentes.
 */
export async function deleteExam(
  prisma: PrismaClient,
  examId: number,
  profesorId: number
) {
  const ownership = await validateExamOwnership(
    prisma,
    examId,
    profesorId,
    "No tienes permiso para eliminar este examen"
  );
  if (ownership.error) {
    return { error: ownership.error };
  }

  const exam = await prisma.exam.update({
    where: { id: examId },
    data: { eliminado: true }
  });

  return { exam };
}

/**
 * Actualiza un examen existente. `titulo`/`ordenAleatorio` siempre se pueden
 * modificar. El reemplazo de `partes` (contenido completo) solo se permite si
 * el examen no tiene intentos de alumnos registrados, para no invalidar datos
 * ya guardados (respuestas referenciando preguntas que dejarían de existir).
 */
export async function updateExam(
  prisma: PrismaClient,
  examId: number,
  body: any,
  profesorId: number
) {
  const ownership = await validateExamOwnership(
    prisma,
    examId,
    profesorId,
    "No tienes permiso para modificar este examen"
  );
  if (ownership.error) {
    return { error: ownership.error };
  }

  const { titulo, ordenAleatorio, partes, referenceFiles } = body;

  if (titulo !== undefined && !titulo.trim()) {
    return { error: { status: 400, error: "El título es requerido" } as ExamValidationError };
  }

  const basicUpdateData: any = {};
  if (titulo !== undefined) basicUpdateData.titulo = titulo.trim();
  if (ordenAleatorio !== undefined) basicUpdateData.ordenAleatorio = !!ordenAleatorio;

  let contentEditWarning: ExamValidationError | null = null;

  if (partes !== undefined) {
    const attemptCount = await prisma.examAttempt.count({ where: { examId } });

    if (attemptCount > 0) {
      // No se puede tocar el contenido: ya hay respuestas de alumnos que dependen
      // de las Preguntas/ExamParts actuales. Se ignora `partes` pero se sigue
      // aplicando el resto del body (titulo/ordenAleatorio).
      contentEditWarning = {
        status: 409,
        error: "No se puede modificar el contenido de un examen con intentos de alumnos registrados"
      };
    } else {
      if (!Array.isArray(partes) || partes.length === 0) {
        return { error: { status: 400, error: "Se requiere al menos una parte (partes)" } as ExamValidationError };
      }

      for (let i = 0; i < partes.length; i++) {
        const validationError = validatePart(partes[i], i);
        if (validationError) {
          return { error: validationError };
        }
      }

      basicUpdateData.tipo = partes.length === 1 ? partes[0].tipo : 'multiple_choice';
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(basicUpdateData).length > 0) {
      await tx.exam.update({ where: { id: examId }, data: basicUpdateData });
    }

    if (partes !== undefined && !contentEditWarning) {
      // Reemplazar contenido: borrar ExamParts existentes (cascada a Pregunta) y
      // recrear, igual que en createExam.
      await tx.examPart.deleteMany({ where: { examId } });

      for (let i = 0; i < partes.length; i++) {
        const parte = partes[i];
        const orden = parte.orden ?? i + 1;
        const partData: any = {
          examId,
          orden,
          tipo: parte.tipo,
        };

        if (parte.tipo === 'programming') {
          partData.lenguajeProgramacion = parte.lenguajeProgramacion;
          partData.intellisenseHabilitado = !!parte.intellisenseHabilitado;
          partData.enunciadoTipo = parte.enunciadoTipo || 'texto';
          partData.enunciadoProgramacion = partData.enunciadoTipo === 'texto' ? parte.enunciadoProgramacion : null;
          partData.enunciadoUrl = partData.enunciadoTipo === 'archivo' ? parte.enunciadoUrl : null;
          partData.enunciadoArchivoNombre = partData.enunciadoTipo === 'archivo' ? (parte.enunciadoArchivoNombre || null) : null;
          partData.datasetFiles = Array.isArray(parte.datasetFiles) && parte.datasetFiles.length > 0
            ? parte.datasetFiles.filter((f: any) => f?.url && f?.nombre)
            : null;
          partData.codigoInicial = parte.codigoInicial || '';
          partData.testCases = parte.testCases || [];
          partData.solucionReferencia = parte.solucionReferencia || null;
        } else if (parte.tipo === 'multiple_choice') {
          const poolDefinido = [parte.cantidadFaciles, parte.cantidadMedias, parte.cantidadDificiles]
            .some(c => c !== undefined && c !== null);
          if (poolDefinido) {
            partData.cantidadFaciles = parte.cantidadFaciles ?? 0;
            partData.cantidadMedias = parte.cantidadMedias ?? 0;
            partData.cantidadDificiles = parte.cantidadDificiles ?? 0;
          }
        }

        const createdPart = await tx.examPart.create({ data: partData });

        if (parte.tipo === 'multiple_choice' && Array.isArray(parte.preguntas)) {
          await tx.pregunta.createMany({
            data: parte.preguntas.map((p: any, pIndex: number) => ({
              partId: createdPart.id,
              tipo: p.tipo || 'multiple_choice',
              dificultad: p.dificultad || 'media',
              texto: p.texto,
              correcta: p.correcta ?? null,
              correctas: p.correctas ?? null,
              puntos: p.puntos ?? 1,
              opciones: p.opciones ?? [],
              orden: p.orden ?? pIndex + 1,
              imagenUrl: p.imagenUrl || null,
            }))
          });
        }
      }
    }
  });

  if (referenceFiles && Array.isArray(referenceFiles) && referenceFiles.length > 0 && !contentEditWarning) {
    const filesWithContent = referenceFiles.filter((f: any) => f.filename && f.content && f.content.trim());

    if (filesWithContent.length > 0) {
      await Promise.all(filesWithContent.map((file: any) =>
        prisma.examFile.upsert({
          where: {
            examId_userId_filename_version: {
              examId,
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
            examId,
            userId: profesorId,
            filename: file.filename,
            content: file.content,
            version: 'reference_solution'
          }
        })
      ));
    }
  }

  const updated = await getExamById(prisma, examId, null, 'professor', profesorId);
  if (updated.error) {
    return { error: updated.error };
  }

  return { exam: updated.exam, contentEditWarning };
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
 * Verifica que la ExamPart exista y que el examen al que pertenece sea del
 * profesor indicado. Devuelve la parte si es válida, o un error listo para responder.
 */
export async function validatePartOwnership(
  prisma: PrismaClient,
  partId: number,
  profesorId: number,
  forbiddenMessage: string
) {
  const parte = await prisma.examPart.findUnique({
    where: { id: partId },
    include: { exam: true }
  });

  if (!parte) {
    return { error: { status: 404, error: "Parte de examen no encontrada" } as ExamValidationError };
  }

  if (parte.exam.profesorId !== profesorId) {
    return { error: { status: 403, error: forbiddenMessage } as ExamValidationError };
  }

  return { parte };
}

/**
 * Ejecuta los test cases de una parte de programación contra el código
 * indicado o contra la solución de referencia guardada.
 */
export async function testSolution(
  prisma: PrismaClient,
  codeExecutionService: CodeExecutionService,
  partId: number,
  profesorId: number,
  code: string | undefined,
  useReferenceSolution: boolean
) {
  // Verificar que la parte existe y pertenece al profesor
  const ownership = await validatePartOwnership(
    prisma,
    partId,
    profesorId,
    "No tienes permiso para ejecutar tests en esta parte del examen"
  );
  if (ownership.error) {
    return { error: ownership.error };
  }

  const parte = ownership.parte!;

  if (parte.tipo !== 'programming') {
    return { error: { status: 400, error: "Esta parte no es de tipo programación" } as ExamValidationError };
  }

  if (!parte.testCases || !Array.isArray(parte.testCases) || parte.testCases.length === 0) {
    return { error: { status: 400, error: "La parte no tiene test cases configurados" } as ExamValidationError };
  }

  // Determinar qué código ejecutar
  let codeToExecute: string;

  if (useReferenceSolution) {
    if (!parte.solucionReferencia) {
      return { error: { status: 400, error: "La parte no tiene una solución de referencia guardada" } as ExamValidationError };
    }
    codeToExecute = parte.solucionReferencia;
  } else {
    if (!code) {
      return { error: { status: 400, error: "Debe proporcionar código para ejecutar" } as ExamValidationError };
    }
    codeToExecute = code;
  }

  // Ejecutar los tests
  const datasets = await loadExamDatasets(parte);
  const testResults = await codeExecutionService.runTests(
    codeToExecute,
    parte.lenguajeProgramacion as 'python' | 'javascript' | 'c',
    parte.testCases as any[],
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
    language as 'python' | 'javascript' | 'c',
    testCases,
    { timeout: 10000 }
  );

  return testResults;
}

/**
 * Guarda o actualiza la solución de referencia de una parte de programación.
 */
export async function saveReferenceSolution(
  prisma: PrismaClient,
  partId: number,
  profesorId: number,
  solucionReferencia: string
) {
  // Verificar que la parte existe y pertenece al profesor
  const ownership = await validatePartOwnership(
    prisma,
    partId,
    profesorId,
    "No tienes permiso para modificar esta parte del examen"
  );
  if (ownership.error) {
    return { error: ownership.error };
  }

  const parte = ownership.parte!;

  if (parte.tipo !== 'programming') {
    return { error: { status: 400, error: "Esta parte no es de tipo programación" } as ExamValidationError };
  }

  // Actualizar la solución de referencia
  const updatedExam = await prisma.examPart.update({
    where: { id: partId },
    data: { solucionReferencia }
  });

  return { exam: updatedExam };
}
