import { type PrismaClient } from "@prisma/client";

/**
 * Resultado de validar disponibilidad de una inscripción/ventana para iniciar un intento.
 */
export interface StartAttemptValidationError {
  status: number;
  error: string;
}

/**
 * Verifica que el estudiante esté inscrito y que la ventana esté disponible para iniciar el intento.
 * Devuelve null si todo está en orden, o un error {status, error} listo para responder.
 */
export async function validateAttemptStart(
  prisma: PrismaClient,
  userId: number,
  examWindowId: number
): Promise<StartAttemptValidationError | null> {
  const inscription = await prisma.inscription.findUnique({
    where: {
      userId_examWindowId: { userId, examWindowId }
    },
    include: {
      examWindow: true
    }
  });

  if (!inscription) {
    return { status: 403, error: "No estás inscrito en esta ventana" };
  }

  // Verificar que la ventana esté activa
  if (!inscription.examWindow.activa) {
    return { status: 403, error: "Esta ventana de examen ha sido desactivada por el profesor" };
  }

  // Verificar disponibilidad del examen
  if (inscription.examWindow.sinTiempo) {
    // Para ventanas sin tiempo, solo verificar que esté activa
    if (!inscription.examWindow.activa) {
      return { status: 403, error: "El examen no está disponible" };
    }
  } else {
    // Para ventanas con tiempo, verificar tiempo y estado
    const now = new Date();
    const startDate = new Date(inscription.examWindow.fechaInicio!);
    const endDate = new Date(startDate.getTime() + (inscription.examWindow.duracion! * 60 * 1000));

    if (inscription.examWindow.estado !== 'en_curso' || now < startDate || now > endDate) {
      return { status: 403, error: "El examen no está disponible" };
    }
  }

  return null;
}

/**
 * Busca un intento existente para userId/examId/examWindowId (o crea uno nuevo si no existe),
 * generando el orden aleatorio de preguntas cuando corresponda. Maneja la condición de carrera
 * en la creación mediante el código de error P2002 de Prisma.
 */
export async function findOrCreateAttempt(
  prisma: PrismaClient,
  userId: number,
  examId: number,
  examWindowId: number | null | undefined
) {
  // Verificar si ya existe un intento
  // Usar findFirst en lugar de findUnique para manejar mejor el null
  const existingAttempt = await prisma.examAttempt.findFirst({
    where: {
      userId,
      examId,
      examWindowId: examWindowId || null
    }
  });

  if (existingAttempt) {
    return existingAttempt;
  }

  // Obtener el examen para verificar si tiene orden aleatorio
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { preguntas: true }
  });

  if (!exam) {
    return null;
  }

  // Preparar datos del intento
  const attemptData: any = {
    userId,
    examId,
    examWindowId: examWindowId ?? null,
    respuestas: {},
    estado: "en_progreso"
  };

  // Si el examen tiene orden aleatorio, generar y guardar el orden randomizado
  if (exam.ordenAleatorio && exam.preguntas && exam.preguntas.length > 0) {
    // Crear array de IDs y randomizar usando Fisher-Yates
    const preguntaIds = exam.preguntas.map(p => p.id);
    for (let i = preguntaIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [preguntaIds[i], preguntaIds[j]] = [preguntaIds[j], preguntaIds[i]];
    }
    attemptData.ordenPreguntas = preguntaIds;
  }

  // Crear nuevo intento con manejo de race condition
  try {
    const attempt = await prisma.examAttempt.create({
      data: attemptData
    });
    return attempt;
  } catch (createError: any) {
    // Si falla por constraint único (race condition), buscar el intento existente
    if (createError.code === 'P2002') {
      const retryAttempt = await prisma.examAttempt.findFirst({
        where: {
          userId,
          examId,
          examWindowId: examWindowId || null
        }
      });
      if (retryAttempt) {
        return retryAttempt;
      }
    }
    throw createError;
  }
}

/**
 * Ejecuta los test cases de un examen de programación contra el código enviado y devuelve
 * el puntaje (porcentaje de tests pasados) junto con el detalle de cada test.
 */
export async function evaluateProgrammingTestCases(
  codigo: string,
  lenguajeProgramacion: string,
  testCases: any[]
): Promise<{ puntaje: number; testResults: any[] }> {
  const CodeExecutionService = (await import('./codeExecution.service.ts')).default;
  const codeExecutionService = new CodeExecutionService();

  let testsPasados = 0;
  const totalTests = testCases.length;
  const testResults: any[] = [];

  for (const testCase of testCases) {
    try {
      const result = await codeExecutionService.executeCode(
        codigo,
        lenguajeProgramacion as 'python' | 'javascript',
        {
          input: testCase.input || '',
          timeout: 10000
        }
      );

      // Comparar output (eliminar espacios en blanco extra)
      const expectedOutput = (testCase.expectedOutput || '').trim();
      const actualOutput = (result.output || '').trim();
      const passed = actualOutput === expectedOutput && result.exitCode === 0;

      if (passed) {
        testsPasados++;
      }

      testResults.push({
        description: testCase.description || 'Test sin descripción',
        passed,
        expected: expectedOutput,
        actual: actualOutput,
        error: result.error,
        executionTime: result.executionTime
      });
    } catch (error: any) {
      console.error('Error ejecutando test case:', error);
      testResults.push({
        description: testCase.description || 'Test sin descripción',
        passed: false,
        expected: testCase.expectedOutput,
        actual: '',
        error: error.message,
        executionTime: 0
      });
    }
  }

  // Calcular puntaje como porcentaje de tests pasados
  const puntajePorcentaje = (testsPasados / totalTests) * 100;

  return { puntaje: puntajePorcentaje, testResults };
}

/**
 * Resultado de preparar los datos de actualización para finalizar un intento de examen
 * de tipo 'programming'.
 */
export interface ProgrammingFinishResult {
  error?: { status: number; error: string };
  updateData?: any;
}

/**
 * Prepara los datos de actualización necesarios para finalizar un intento de un examen
 * de tipo 'programming': localiza el archivo principal guardado manualmente, y si el
 * examen tiene test cases, los ejecuta para calcular el puntaje automático.
 */
export async function prepareProgrammingFinishData(
  prisma: PrismaClient,
  attempt: { examId: number; userId: number }
): Promise<ProgrammingFinishResult> {
  // 🔒 Obtener el archivo principal guardado manualmente
  // Convención: main.py (Python) o main.js (JavaScript)
  const exam = await prisma.exam.findUnique({
    where: { id: attempt.examId }
  });

  if (!exam) {
    return { error: { status: 404, error: "Examen no encontrado" } };
  }

  // Determinar el nombre del archivo principal según el lenguaje
  const mainFileName = exam.lenguajeProgramacion === 'python' ? 'main.py' : 'main.js';

  // Buscar el archivo principal guardado manualmente (versión "manual")
  const mainFile = await prisma.examFile.findFirst({
    where: {
      examId: attempt.examId,
      userId: attempt.userId,
      filename: mainFileName,
      version: 'manual'
    },
    orderBy: {
      updatedAt: 'desc' // Obtener la versión más reciente
    }
  });

  // Validar que existe el archivo principal (permite contenido vacío)
  if (!mainFile) {
    return {
      error: {
        status: 400,
        error: `Debes guardar el archivo principal "${mainFileName}" antes de finalizar el examen`
      }
    };
  }

  // Usar el contenido del archivo guardado manualmente (puede estar vacío)
  const codigoParaEvaluar = mainFile.content || '';
  const updateData: any = { codigoProgramacion: codigoParaEvaluar };

  // Evaluación automática con test cases
  if (exam.testCases && Array.isArray(exam.testCases) && exam.testCases.length > 0) {
    const { puntaje, testResults } = await evaluateProgrammingTestCases(
      codigoParaEvaluar,
      exam.lenguajeProgramacion as string,
      exam.testCases as any[]
    );

    updateData.puntaje = puntaje;
    updateData.testResults = testResults;
  }

  return { updateData };
}

/**
 * Prepara los datos de actualización necesarios para finalizar un intento de un examen
 * de tipo 'multiple_choice': guarda las respuestas del estudiante en RespuestaEstudiante
 * y calcula el puntaje automático comparando contra las respuestas correctas.
 */
export async function prepareMultipleChoiceFinishData(
  prisma: PrismaClient,
  attemptId: number,
  examId: number,
  respuestas: any
): Promise<any> {
  const updateData: any = {};

  // Guardar respuestas en la nueva tabla RespuestaEstudiante
  if (respuestas && typeof respuestas === 'object') {
    const respuestasArray = Object.entries(respuestas).map(([preguntaId, valor]) => ({
      attemptId,
      preguntaId: parseInt(preguntaId),
      valor
    }));

    // Crear todas las respuestas en batch
    await prisma.respuestaEstudiante.createMany({
      data: respuestasArray,
      skipDuplicates: true
    });
  }

  // Calcular puntaje automáticamente
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { preguntas: true }
  });

  if (exam && exam.preguntas && exam.preguntas.length > 0) {
    let correctas = 0;
    const totalPreguntas = exam.preguntas.length;

    // IMPORTANTE: Las respuestas ahora vienen con preguntaId como key (no índice)
    // para soportar orden aleatorio de preguntas
    exam.preguntas.forEach((pregunta) => {
      const respuestaEstudiante = respuestas?.[pregunta.id];

      if (respuestaEstudiante === undefined || respuestaEstudiante === null) {
        // No respondió
        return;
      }

      // Evaluar según el tipo de pregunta
      if (pregunta.tipo === 'fill_in_blank') {
        // Para fill_in_blank, la respuesta debe ser un array con los ÍNDICES de las respuestas correctas en orden
        if (Array.isArray(respuestaEstudiante) && Array.isArray(pregunta.opciones)) {
          // pregunta.correcta indica cuántas respuestas correctas hay
          // Las primeras N opciones son las correctas (en orden)
          const numRespuestasCorrectas = pregunta.correcta || 0;
          const respuestasCorrectasTexto = pregunta.opciones.slice(0, numRespuestasCorrectas);

          // Verificar que el estudiante seleccionó el número correcto de opciones
          if (respuestaEstudiante.length === numRespuestasCorrectas) {
            // Convertir los índices del estudiante a los textos de las respuestas
            const respuestasEstudianteTexto = respuestaEstudiante.map((indice: number) => {
              // Validar que el índice está en rango
              if (indice >= 0 && indice < pregunta.opciones.length) {
                return pregunta.opciones[indice];
              }
              return null;
            });

            // Verificar que cada respuesta esté en la posición correcta comparando los textos
            let todasCorrectas = true;
            for (let i = 0; i < numRespuestasCorrectas; i++) {
              const estudianteTexto = String(respuestasEstudianteTexto[i] || '').trim();
              const correctaTexto = String(respuestasCorrectasTexto[i] || '').trim();
              if (estudianteTexto !== correctaTexto) {
                todasCorrectas = false;
                break;
              }
            }

            if (todasCorrectas) {
              correctas++;
            }
          }
        }
      } else if (pregunta.tipo === 'matching') {
        // Para matching, la respuesta es un array donde cada índice representa un concepto
        // y el valor es el índice de la respuesta seleccionada
        // Formato: [respuestaParaConcepto0, respuestaParaConcepto1, ...]
        if (Array.isArray(respuestaEstudiante) && Array.isArray(pregunta.opciones)) {
          const numConceptos = pregunta.correcta || 0;

          // Verificar que el estudiante respondió para todos los conceptos
          if (respuestaEstudiante.length === numConceptos) {
            let todasCorrectas = true;

            // Verificar cada emparejamiento
            for (let i = 0; i < numConceptos; i++) {
              // La respuesta correcta para el concepto i es la que está en la posición (correcta + i)
              const indiceRespuestaCorrecta = numConceptos + i;
              const indiceRespuestaEstudiante = respuestaEstudiante[i];

              // Comparar los índices de las respuestas
              if (indiceRespuestaEstudiante !== indiceRespuestaCorrecta) {
                todasCorrectas = false;
                break;
              }
            }

            if (todasCorrectas) {
              correctas++;
            }
          }
        }
      } else {
        // Para multiple_choice y true_false, comparar índice directamente
        if (respuestaEstudiante === pregunta.correcta) {
          correctas++;
        }
      }
    });

    // Calcular puntaje sobre 100
    const puntaje = (correctas / totalPreguntas) * 100;
    updateData.puntaje = puntaje;
  }

  return updateData;
}

/**
 * Obtiene los archivos guardados por el estudiante para un examen de programación,
 * usados al mostrar los resultados de un intento finalizado.
 */
export async function getExamFilesForResults(
  prisma: PrismaClient,
  examId: number,
  userId: number
) {
  return prisma.examFile.findMany({
    where: {
      examId,
      userId
    },
    select: {
      id: true,
      filename: true,
      content: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
}

/**
 * Obtiene los archivos (versión manual y de submission) guardados por el estudiante para
 * un examen de programación, usados en la vista de profesor de un intento.
 */
export async function getExamFilesForProfessorView(
  prisma: PrismaClient,
  examId: number,
  userId: number
) {
  const manualFiles = await prisma.examFile.findMany({
    where: {
      examId,
      userId,
      version: 'manual'
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

  const submissionFiles = await prisma.examFile.findMany({
    where: {
      examId,
      userId,
      version: 'submission'
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

  return { manualFiles, submissionFiles };
}
