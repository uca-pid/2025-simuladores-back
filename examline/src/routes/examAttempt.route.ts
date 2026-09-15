import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const ExamAttemptRoute = (prisma: PrismaClient) => {
  const router = Router();

  // POST /exam-attempts/start - Iniciar un intento de examen (students only)
  router.post("/start", authenticateToken, requireRole(['student']), async (req, res) => {
    const { examId, examWindowId } = req.body;
    const userId = req.user!.userId;

    try {
      // Verificar que el estudiante esté inscrito y habilitado
      if (examWindowId) {
        const inscription = await prisma.inscription.findUnique({
          where: {
            userId_examWindowId: { userId, examWindowId }
          },
          include: {
            examWindow: true
          }
        });

        if (!inscription) {
          return res.status(403).json({ error: "No estás inscrito en esta ventana" });
        }

        // Verificar que la ventana esté activa
        if (!inscription.examWindow.activa) {
          return res.status(403).json({ error: "Esta ventana de examen ha sido desactivada por el profesor" });
        }

        // Verificar disponibilidad del examen
        if (inscription.examWindow.sinTiempo) {
          // Para ventanas sin tiempo, solo verificar que esté activa
          if (!inscription.examWindow.activa) {
            return res.status(403).json({ error: "El examen no está disponible" });
          }
        } else {
          // Para ventanas con tiempo, verificar tiempo y estado
          const now = new Date();
          const startDate = new Date(inscription.examWindow.fechaInicio!);
          const endDate = new Date(startDate.getTime() + (inscription.examWindow.duracion! * 60 * 1000));

          if (inscription.examWindow.estado !== 'en_curso' || now < startDate || now > endDate) {
            return res.status(403).json({ error: "El examen no está disponible" });
          }
        }
      }

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
        return res.json(existingAttempt);
      }

      // Obtener el examen para verificar si tiene orden aleatorio
      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: { preguntas: true }
      });

      if (!exam) {
        return res.status(404).json({ error: "Examen no encontrado" });
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
        res.json(attempt);
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
            return res.json(retryAttempt);
          }
        }
        throw createError;
      }
    } catch (error) {
      console.error('Error starting exam attempt:', error);
      res.status(500).json({ error: "Error iniciando intento de examen" });
    }
  });

  // PUT /exam-attempts/:attemptId/save-code - Guardar código de programación
  router.put("/:attemptId/save-code", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;
    const { codigoProgramacion } = req.body;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      // Verificar que el intento pertenece al usuario
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: { exam: true }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      if (attempt.userId !== userId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      if (attempt.estado !== "en_progreso") {
        return res.status(400).json({ error: "El intento ya fue finalizado" });
      }

      // Verificar que es un examen de programación
      if (attempt.exam.tipo !== 'programming') {
        return res.status(400).json({ error: "Esta ruta es solo para exámenes de programación" });
      }

      // Guardar código
      const updatedAttempt = await prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          codigoProgramacion: codigoProgramacion
        }
      });

      res.json({ message: "Código guardado exitosamente", attempt: updatedAttempt });
    } catch (error) {
      console.error('Error saving code:', error);
      res.status(500).json({ error: "Error guardando código" });
    }
  });

  // PUT /exam-attempts/:attemptId/finish - Finalizar intento
  router.put("/:attemptId/finish", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;
    const { respuestas, codigoProgramacion } = req.body;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      // Verificar que el intento pertenece al usuario
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: { exam: true }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      if (attempt.userId !== userId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      if (attempt.estado !== "en_progreso") {
        return res.status(400).json({ error: "El intento ya fue finalizado" });
      }

      // Preparar datos de actualización
      const updateData: any = {
        finishedAt: new Date(),
        estado: "finalizado"
      };

      // Agregar datos específicos según el tipo de examen
      if (attempt.exam.tipo === 'programming') {
        // 🔒 Obtener el archivo principal guardado manualmente
        // Convención: main.py (Python) o main.js (JavaScript)
        const exam = await prisma.exam.findUnique({
          where: { id: attempt.examId }
        });
        
        if (!exam) {
          return res.status(404).json({ error: "Examen no encontrado" });
        }
        
        // Determinar el nombre del archivo principal según el lenguaje
        const mainFileName = exam.lenguajeProgramacion === 'python' ? 'main.py' : 'main.js';
        
        // Buscar el archivo principal guardado manualmente (versión "manual")
        const mainFile = await prisma.examFile.findFirst({
          where: {
            examId: attempt.examId,
            userId: userId,
            filename: mainFileName,
            version: 'manual'
          },
          orderBy: {
            updatedAt: 'desc' // Obtener la versión más reciente
          }
        });
        
        // Validar que existe el archivo principal (permite contenido vacío)
        if (!mainFile) {
          return res.status(400).json({ 
            error: `Debes guardar el archivo principal "${mainFileName}" antes de finalizar el examen` 
          });
        }
        
        // Usar el contenido del archivo guardado manualmente (puede estar vacío)
        const codigoParaEvaluar = mainFile.content || '';
        updateData.codigoProgramacion = codigoParaEvaluar;
        
        // Evaluación automática con test cases
        if (exam.testCases && Array.isArray(exam.testCases) && exam.testCases.length > 0) {
          const CodeExecutionService = (await import('../services/codeExecution.service.ts')).default;
          const codeExecutionService = new CodeExecutionService();
          
          let testsPasados = 0;
          const totalTests = exam.testCases.length;
          const testResults: any[] = [];
          
          for (const testCase of exam.testCases as any[]) {
            try {
              const result = await codeExecutionService.executeCode(
                codigoParaEvaluar,
                exam.lenguajeProgramacion as 'python' | 'javascript',
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
          
          updateData.puntaje = puntajePorcentaje;
          updateData.testResults = testResults;
        }
      } else if (attempt.exam.tipo === 'multiple_choice') {
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
          where: { id: attempt.examId },
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
      }

      // Finalizar intento
      const updatedAttempt = await prisma.examAttempt.update({
        where: { id: attemptId },
        data: updateData
      });

      res.json(updatedAttempt);
    } catch (error) {
      console.error('Error finishing exam attempt:', error);
      res.status(500).json({ error: "Error finalizando intento de examen" });
    }
  });

  // GET /exam-attempts/check/:examId - Verificar si existe intento para un examen
  router.get("/check/:examId", authenticateToken, requireRole(['student']), async (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.user!.userId;
    const { windowId } = req.query;

    if (isNaN(examId)) {
      return res.status(400).json({ error: "ID de examen inválido" });
    }

    try {
      const examWindowId = windowId ? parseInt(windowId as string) : null;
      
      // Construir where clause manejando null correctamente
      const whereClause: any = {
        userId,
        examId
      };
      
      // Solo agregar examWindowId si no es null
      if (examWindowId !== null) {
        whereClause.examWindowId = examWindowId;
      } else {
        whereClause.examWindowId = null;
      }
      
      const attempt = await prisma.examAttempt.findFirst({
        where: whereClause
      });

      res.json({ hasAttempt: !!attempt, attempt });
    } catch (error) {
      console.error('Error checking exam attempt:', error);
      res.status(500).json({ error: "Error verificando intento" });
    }
  });

  // GET /exam-attempts/my-attempts - Obtener todos los intentos del estudiante autenticado
  router.get("/my-attempts", authenticateToken, requireRole(['student']), async (req, res) => {
    const userId = req.user!.userId;

    try {
      const attempts = await prisma.examAttempt.findMany({
        where: {
          userId,
          estado: "finalizado" // Solo intentos finalizados para estadísticas
        },
        include: {
          exam: {
            select: {
              id: true,
              titulo: true,
              tipo: true
            }
          },
          examWindow: {
            select: {
              id: true,
              fechaInicio: true
            }
          }
        },
        orderBy: {
          finishedAt: 'desc'
        }
      });

      res.json(attempts);
    } catch (error) {
      console.error('Error fetching student attempts:', error);
      res.status(500).json({ error: "Error obteniendo intentos del estudiante" });
    }
  });

  // GET /exam-attempts/:attemptId/results - Ver resultados con respuestas correctas (solo intentos finalizados)
  router.get("/:attemptId/results", authenticateToken, requireRole(['student']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const userId = req.user!.userId;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: {
            include: { preguntas: true }
          },
          examWindow: true,
          respuestas: true // Incluir respuestas del nuevo modelo
        }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      // Solo el propietario del intento puede verlo
      if (attempt.userId !== userId) {
        return res.status(403).json({ error: "No autorizado para ver este intento" });
      }

      // Solo intentos finalizados pueden mostrar resultados
      if (attempt.estado !== "finalizado") {
        return res.status(403).json({ error: "El intento debe estar finalizado para ver resultados" });
      }

      // Convertir respuestas a formato legacy { preguntaId: valor }
      const respuestasLegacy: any = {};
      attempt.respuestas.forEach((resp) => {
        respuestasLegacy[resp.preguntaId] = resp.valor;
      });

      // Si es un examen de programación, incluir archivos guardados
      let examFiles: any[] = [];
      if (attempt.exam.tipo === 'programming') {
        examFiles = await prisma.examFile.findMany({
          where: {
            examId: attempt.examId,
            userId: userId
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

      // Agregar archivos al resultado
      const result = {
        ...attempt,
        respuestas: respuestasLegacy, // Usar formato legacy para compatibilidad con frontend
        examFiles: examFiles
      };

      res.json(result);
    } catch (error) {
      console.error('Error fetching attempt results:', error);
      res.status(500).json({ error: "Error obteniendo resultados del intento" });
    }
  });

  // GET /exam-attempts/window/:windowId - Obtener todos los intentos de una ventana (solo profesores)
  router.get("/window/:windowId", authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.windowId);
    const professorId = req.user!.userId;

    if (isNaN(windowId)) {
      return res.status(400).json({ error: "ID de ventana inválido" });
    }

    try {
      // Verificar que el profesor es dueño de esta ventana
      const examWindow = await prisma.examWindow.findUnique({
        where: { id: windowId },
        include: {
          exam: {
            select: {
              id: true,
              titulo: true,
              tipo: true,
              profesorId: true
            }
          }
        }
      });

      if (!examWindow) {
        return res.status(404).json({ error: "Ventana no encontrada" });
      }

      if (examWindow.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado para ver estos intentos" });
      }

      // Obtener todos los intentos finalizados de esta ventana
      const attempts = await prisma.examAttempt.findMany({
        where: {
          examWindowId: windowId,
          estado: "finalizado"
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
              tipo: true,
              lenguajeProgramacion: true
            }
          }
        },
        orderBy: [
          { finishedAt: 'desc' }
        ]
      });

      res.json(attempts);
    } catch (error) {
      console.error('Error fetching window attempts:', error);
      res.status(500).json({ error: "Error obteniendo intentos de la ventana" });
    }
  });

  // GET /exam-attempts/:attemptId/professor-view - Ver detalle de un intento (solo profesores)
  router.get("/:attemptId/professor-view", authenticateToken, requireRole(['professor']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const professorId = req.user!.userId;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: {
            include: { 
              preguntas: true
            }
          },
          examWindow: true,
          user: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          }
        }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      // Verificar que el profesor es dueño del examen
      if (attempt.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado para ver este intento" });
      }

      // Si es un examen de programación, incluir archivos guardados (ambas versiones)
      let manualFiles: any[] = [];
      let submissionFiles: any[] = [];
      
      if (attempt.exam.tipo === 'programming') {
        manualFiles = await prisma.examFile.findMany({
          where: {
            examId: attempt.examId,
            userId: attempt.userId,
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

        submissionFiles = await prisma.examFile.findMany({
          where: {
            examId: attempt.examId,
            userId: attempt.userId,
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
      }

      // Agregar archivos al resultado
      const result = {
        ...attempt,
        manualFiles,
        submissionFiles
      };

      res.json(result);
    } catch (error) {
      console.error('Error fetching attempt for professor:', error);
      res.status(500).json({ error: "Error obteniendo intento" });
    }
  });

  // PUT /exam-attempts/:attemptId/manual-grade - Asignar calificación manual (solo profesores)
  router.put("/:attemptId/manual-grade", authenticateToken, requireRole(['professor']), async (req, res) => {
    const attemptId = parseInt(req.params.attemptId);
    const professorId = req.user!.userId;
    const { calificacionManual, comentariosCorreccion } = req.body;

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    if (calificacionManual === undefined || calificacionManual === null) {
      return res.status(400).json({ error: "Calificación manual requerida" });
    }

    try {
      // Verificar que el intento existe y el profesor es dueño del examen
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: {
            select: {
              profesorId: true
            }
          }
        }
      });

      if (!attempt) {
        return res.status(404).json({ error: "Intento no encontrado" });
      }

      if (attempt.exam.profesorId !== professorId) {
        return res.status(403).json({ error: "No autorizado para calificar este intento" });
      }

      // Actualizar calificación manual
      const updatedAttempt = await prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          calificacionManual: parseFloat(calificacionManual),
          comentariosCorreccion: comentariosCorreccion || null,
          corregidoPor: professorId,
          corregidoAt: new Date()
        }
      });

      res.json(updatedAttempt);
    } catch (error) {
      console.error('Error updating manual grade:', error);
      res.status(500).json({ error: "Error actualizando calificación manual" });
    }
  });

  return router;
};

export default ExamAttemptRoute;