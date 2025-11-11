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

        // Solo verificar presente si la ventana requiere presentismo
        // Ser defensivo: si requierePresente es null/undefined, asumir false (acceso libre)
        const requierePresente = inscription.examWindow.requierePresente === true;
        if (requierePresente && !inscription.presente) {
          return res.status(403).json({ error: "No estás habilitado para este examen" });
        }

        // Verificar que la ventana esté activa
        if (!inscription.examWindow.activa) {
          return res.status(403).json({ error: "Esta ventana de examen ha sido desactivada por el profesor" });
        }

        // Verificar disponibilidad del examen
        if (inscription.examWindow.sinTiempo) {
          // Para ventanas sin tiempo, solo verificar que esté activa
          if (inscription.examWindow.estado !== 'programada') {
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
      const existingAttempt = await prisma.examAttempt.findUnique({
        where: {
          userId_examId_examWindowId: {
            userId,
            examId,
            examWindowId: examWindowId || null
          }
        }
      });

      if (existingAttempt) {
        return res.json(existingAttempt);
      }

      // Crear nuevo intento
      const attempt = await prisma.examAttempt.create({
        data: {
          userId,
          examId,
          examWindowId: examWindowId || null,
          respuestas: {},
          estado: "en_progreso"
        }
      });

      res.json(attempt);
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

    console.log('🔍 Backend - Finalizando intento:', attemptId);
    console.log('📥 Backend - Respuestas recibidas:', respuestas);
    console.log('📦 Backend - Body completo:', req.body);

    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "ID de intento inválido" });
    }

    try {
      // Verificar que el intento pertenece al usuario
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: { exam: true }
      });

      console.log('📝 Backend - Tipo de examen:', attempt?.exam.tipo);

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
      console.log('🔍 Verificando tipo de examen:', attempt.exam.tipo);
      console.log('🔍 ¿Es programming?', attempt.exam.tipo === 'programming');
      console.log('🔍 ¿Es multiple_choice?', attempt.exam.tipo === 'multiple_choice');
      
      if (attempt.exam.tipo === 'programming') {
        updateData.codigoProgramacion = codigoProgramacion;
        console.log('💻 Rama programming ejecutada');
        
        // NUEVO: Evaluación automática con test cases
        const exam = await prisma.exam.findUnique({
          where: { id: attempt.examId }
        });
        
        if (exam && exam.testCases && Array.isArray(exam.testCases) && exam.testCases.length > 0) {
          console.log('🧪 Ejecutando test cases automáticos...');
          
          const CodeExecutionService = (await import('../services/codeExecution.service.ts')).default;
          const codeExecutionService = new CodeExecutionService();
          
          let testsPasados = 0;
          const totalTests = exam.testCases.length;
          const testResults: any[] = [];
          
          for (const testCase of exam.testCases as any[]) {
            try {
              const result = await codeExecutionService.executeCode(
                codigoProgramacion,
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
              
              console.log(`${passed ? '✅' : '❌'} Test: ${testCase.description} - ${passed ? 'PASÓ' : 'FALLÓ'}`);
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
          console.log(`📊 Tests pasados: ${testsPasados}/${totalTests} = ${puntajePorcentaje.toFixed(1)}%`);
        } else {
          console.log('⚠️ No hay test cases definidos para este examen de programación');
        }
      } else if (attempt.exam.tipo === 'multiple_choice') {
        console.log('📝 Rama multiple_choice ejecutada');
        updateData.respuestas = respuestas || {};
        console.log('📝 Respuestas a guardar:', updateData.respuestas);
        
        // Calcular puntaje automáticamente
        console.log('🔍 Buscando examen con ID:', attempt.examId);
        const exam = await prisma.exam.findUnique({
          where: { id: attempt.examId },
          include: { preguntas: true }
        });

        console.log('📚 Examen encontrado:', exam ? 'Sí' : 'No');
        console.log('📚 Cantidad de preguntas:', exam?.preguntas?.length || 0);

        if (exam && exam.preguntas && exam.preguntas.length > 0) {
          let correctas = 0;
          const totalPreguntas = exam.preguntas.length;

          exam.preguntas.forEach((pregunta, index) => {
            const respuestaEstudiante = respuestas?.[index];
            console.log(`❓ Pregunta ${index}: correcta=${pregunta.correcta}, estudiante=${respuestaEstudiante}, match=${respuestaEstudiante === pregunta.correcta}`);
            if (respuestaEstudiante !== undefined && respuestaEstudiante === pregunta.correcta) {
              correctas++;
            }
          });

          // Calcular puntaje sobre 100
          const puntaje = (correctas / totalPreguntas) * 100;
          updateData.puntaje = puntaje;

          console.log(`📊 Puntaje calculado: ${correctas}/${totalPreguntas} correctas = ${puntaje.toFixed(2)}%`);
        } else {
          console.log('⚠️ No se pudo calcular puntaje - exam o preguntas no encontradas');
        }
      } else {
        console.log('❌ Tipo de examen no reconocido:', attempt.exam.tipo);
      }

      console.log('💾 Backend - Datos a actualizar:', updateData);

      // Finalizar intento
      const updatedAttempt = await prisma.examAttempt.update({
        where: { id: attemptId },
        data: updateData
      });

      console.log('✅ Backend - Intento actualizado con puntaje:', updatedAttempt.puntaje);

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
      
      const attempt = await prisma.examAttempt.findFirst({
        where: {
          userId,
          examId,
          examWindowId
        }
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
          examWindow: true
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
        examFiles: examFiles
      };

      res.json(result);
    } catch (error) {
      console.error('Error fetching attempt results:', error);
      res.status(500).json({ error: "Error obteniendo resultados del intento" });
    }
  });

  return router;
};

export default ExamAttemptRoute;