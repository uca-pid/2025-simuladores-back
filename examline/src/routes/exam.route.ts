import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole, requireOwnership } from "../middleware/auth.ts";
import CodeExecutionService from "../services/codeExecution.service.ts";

const ExamRoute = (prisma: PrismaClient) => {
  const router = Router();
  const codeExecutionService = new CodeExecutionService();

  // POST /exams/create (protected - professors only)
  router.post("/create", authenticateToken, requireRole(['professor']), async (req, res) => {
    const { 
      titulo, 
      preguntas, 
      tipo = 'multiple_choice',
      ordenAleatorio = false,
      lenguajeProgramacion, 
      intellisenseHabilitado = false,
      enunciadoProgramacion,
      codigoInicial,
      testCases,
      solucionReferencia,
      referenceFiles // Array de archivos de referencia
    } = req.body;

    try {
      // Validar campos según el tipo de examen
      if (tipo === 'programming') {
        if (!lenguajeProgramacion || !['python', 'javascript'].includes(lenguajeProgramacion)) {
          return res.status(400).json({ 
            error: "Para exámenes de programación se requiere especificar el lenguaje (python o javascript)" 
          });
        }
        if (!enunciadoProgramacion) {
          return res.status(400).json({ 
            error: "Para exámenes de programación se requiere especificar el enunciado" 
          });
        }
      } else if (tipo === 'multiple_choice') {
        if (!preguntas || preguntas.length === 0) {
          return res.status(400).json({ 
            error: "Para exámenes de multiple choice se requieren preguntas" 
          });
        }
      }

      const examData: any = {
        titulo,
        tipo,
        ordenAleatorio,
        profesorId: req.user!.userId,
      };

      // Agregar campos específicos según el tipo
      if (tipo === 'programming') {
        examData.lenguajeProgramacion = lenguajeProgramacion;
        examData.intellisenseHabilitado = intellisenseHabilitado;
        examData.enunciadoProgramacion = enunciadoProgramacion;
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
                  userId: req.user!.userId,
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
                userId: req.user!.userId,
                filename: file.filename,
                content: file.content,
                version: 'reference_solution'
              }
            })
          ));
        }
      }

      res.status(201).json(examen);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "No se pudo crear el examen" });
    }
  });

  // GET /exams (protected - get exams for authenticated professor, or all exams if system admin)
  router.get("/", authenticateToken, async (req, res) => {
      try {
        let profesorId: number;
        
        if (req.user!.rol === 'professor') {
          // Professors can only see their own exams
          profesorId = req.user!.userId;
        } else if (req.user!.rol === 'system') {
          // System users can specify profesorId in query, or get all exams
          const queryProfesorId = req.query.profesorId;
          if (queryProfesorId) {
            profesorId = Number(queryProfesorId);
            if (isNaN(profesorId)) {
              return res.status(400).json({ error: "ProfesorId inválido" });
            }
          } else {
            // Get all exams for system users
            const exams = await prisma.exam.findMany({
              include: { preguntas: true, profesor: { select: { nombre: true, email: true } } },
            });
            return res.json(exams);
          }
        } else {
          return res.status(403).json({ error: "No tienes permisos para ver exámenes" });
        }
  
        const exams = await prisma.exam.findMany({
          where: { profesorId },
          include: { preguntas: true },
        });
  
        res.json(exams);
      } catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).json({ error: "Error al obtener exámenes" });
      }
    });

  // GET /exams/:examId → trae examen con validación de inscripción para estudiantes
  router.get("/:examId", authenticateToken, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const windowId = req.query.windowId ? parseInt(req.query.windowId as string) : null;

    if (isNaN(examId)) return res.status(400).json({ error: "examId inválido" });

    try {
      // 🔒 VALIDACIÓN DE SEGURIDAD PARA PROFESORES
      // Verificar que el profesor sea dueño del examen o que sea estudiante inscrito
      if (req.user!.rol === 'professor') {
        const exam = await prisma.exam.findUnique({
          where: { id: examId },
          select: { profesorId: true }
        });

        if (!exam) {
          return res.status(404).json({ error: "Examen no encontrado" });
        }

        // Solo el profesor dueño puede ver su examen
        if (exam.profesorId !== req.user!.userId) {
          return res.status(403).json({ 
            error: "No tienes permisos para acceder a este examen",
            code: "NOT_OWNER" 
          });
        }
      }

      // 🔒 VALIDACIÓN DE SEGURIDAD PARA ESTUDIANTES
      if (req.user!.rol === 'student') {
        // Requiere windowId para estudiantes
        if (!windowId) {
          return res.status(400).json({ 
            error: "Se requiere windowId para acceder al examen",
            code: "WINDOW_ID_REQUIRED" 
          });
        }

        // Verificar inscripción y permisos
        const inscription = await prisma.inscription.findFirst({
          where: {
            userId: req.user!.userId,
            examWindowId: windowId
          },
          include: {
            examWindow: true
          }
        });

        if (!inscription) {
          return res.status(403).json({ 
            error: "No estás inscrito en esta ventana de examen",
            code: "NOT_ENROLLED" 
          });
        }

        // Verificar que el examen de la ventana coincida con el solicitado
        if (inscription.examWindow.examId !== examId) {
          return res.status(403).json({ 
            error: "La ventana no corresponde a este examen",
            code: "EXAM_MISMATCH" 
          });
        }

        // Verificar que la ventana esté activa
        if (!inscription.examWindow.activa) {
          return res.status(403).json({ 
            error: "Esta ventana de examen ha sido desactivada por el profesor",
            code: "WINDOW_DEACTIVATED"
          });
        }

        // Verificar disponibilidad del examen
        if (inscription.examWindow.sinTiempo) {
      
    
        } else {
          // Para ventanas con tiempo, verificar estado y tiempo
          const now = new Date();
          const startDate = new Date(inscription.examWindow.fechaInicio!);
          const endDate = new Date(startDate.getTime() + (inscription.examWindow.duracion! * 60 * 1000));

          if (inscription.examWindow.estado !== 'en_curso' || now < startDate || now > endDate) {
            return res.status(403).json({ 
              error: "El examen no está disponible en este momento",
              code: "EXAM_NOT_AVAILABLE",
              estado: inscription.examWindow.estado,
              fechaInicio: inscription.examWindow.fechaInicio,
              fechaFin: endDate
            });
          }
        }
      }

      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: { preguntas: true },
      });

      if (!exam) return res.status(404).json({ error: "Examen no encontrado" });

      // Auto-register history for students
      if (req.user!.rol === 'student') {
        await prisma.examHistory.upsert({
          where: { userId_examId: { userId: req.user!.userId, examId } },
          update: { viewedAt: new Date() },
          create: { userId: req.user!.userId, examId },
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
        
        return res.json(sanitizedExam);
      }

      // 🔒 Validación de propiedad para profesores
      if (req.user!.rol === 'professor' && exam.profesorId !== req.user!.userId) {
        return res.status(403).json({ error: "No tienes permiso para ver este examen" });
      }

      // Ocultar solución de referencia si no es el profesor dueño
      const examResponse = { ...exam };
      if (exam.profesorId !== req.user!.userId) {
        delete (examResponse as any).solucionReferencia;
      }

      res.json(examResponse);
    } catch (error) {
      console.error('Error fetching exam:', error);
      res.status(500).json({ error: "Error al obtener el examen" });
    }
  });

  // POST /exams/:id/test-solution (protected - professors only)
  // Ejecuta tests contra código temporal o solución de referencia
  router.post("/:id/test-solution", authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const { code, useReferenceSolution } = req.body;

      if (isNaN(examId)) {
        return res.status(400).json({ error: "ID de examen inválido" });
      }

      // Verificar que el examen existe y pertenece al profesor
      const exam = await prisma.exam.findUnique({
        where: { id: examId }
      });

      if (!exam) {
        return res.status(404).json({ error: "Examen no encontrado" });
      }

      if (exam.profesorId !== req.user!.userId) {
        return res.status(403).json({ error: "No tienes permiso para ejecutar tests en este examen" });
      }

      if (exam.tipo !== 'programming') {
        return res.status(400).json({ error: "Este examen no es de tipo programación" });
      }

      if (!exam.testCases || !Array.isArray(exam.testCases) || exam.testCases.length === 0) {
        return res.status(400).json({ error: "El examen no tiene test cases configurados" });
      }

      // Determinar qué código ejecutar
      let codeToExecute: string;
      
      if (useReferenceSolution) {
        if (!exam.solucionReferencia) {
          return res.status(400).json({ error: "El examen no tiene una solución de referencia guardada" });
        }
        codeToExecute = exam.solucionReferencia;
      } else {
        if (!code) {
          return res.status(400).json({ error: "Debe proporcionar código para ejecutar" });
        }
        codeToExecute = code;
      }

      // Ejecutar los tests
      const testResults = await codeExecutionService.runTests(
        codeToExecute,
        exam.lenguajeProgramacion as 'python' | 'javascript',
        exam.testCases as any[],
        { timeout: 10000 }
      );

      return res.json({
        success: true,
        ...testResults
      });

    } catch (error: any) {
      console.error('Error ejecutando tests:', error);
      return res.status(500).json({
        error: 'Error interno al ejecutar tests',
        details: error.message
      });
    }
  });

  // POST /exams/test-solution-preview (protected - professors only)
  // Ejecuta tests contra código durante la creación del examen (sin examen guardado)
  router.post("/test-solution-preview", authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const { code, language, testCases } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Debe proporcionar código para ejecutar" });
      }

      if (!language || !['python', 'javascript'].includes(language)) {
        return res.status(400).json({ error: "Lenguaje no válido. Use 'python' o 'javascript'" });
      }

      if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar test cases" });
      }

      // Ejecutar los tests
      const testResults = await codeExecutionService.runTests(
        code,
        language as 'python' | 'javascript',
        testCases,
        { timeout: 10000 }
      );

      return res.json({
        success: true,
        ...testResults
      });

    } catch (error: any) {
      console.error('Error ejecutando tests en preview:', error);
      return res.status(500).json({
        error: 'Error interno al ejecutar tests',
        details: error.message
      });
    }
  });

  // PUT /exams/:id/reference-solution (protected - professors only)
  // Guarda o actualiza la solución de referencia
  router.put("/:id/reference-solution", authenticateToken, requireRole(['professor']), async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const { solucionReferencia } = req.body;

      if (isNaN(examId)) {
        return res.status(400).json({ error: "ID de examen inválido" });
      }

      // Verificar que el examen existe y pertenece al profesor
      const exam = await prisma.exam.findUnique({
        where: { id: examId }
      });

      if (!exam) {
        return res.status(404).json({ error: "Examen no encontrado" });
      }

      if (exam.profesorId !== req.user!.userId) {
        return res.status(403).json({ error: "No tienes permiso para modificar este examen" });
      }

      if (exam.tipo !== 'programming') {
        return res.status(400).json({ error: "Este examen no es de tipo programación" });
      }

      // Actualizar la solución de referencia
      const updatedExam = await prisma.exam.update({
        where: { id: examId },
        data: { solucionReferencia }
      });

      return res.json({
        success: true,
        message: "Solución de referencia actualizada correctamente",
        exam: updatedExam
      });

    } catch (error: any) {
      console.error('Error guardando solución de referencia:', error);
      return res.status(500).json({
        error: 'Error interno al guardar solución de referencia',
        details: error.message
      });
    }
  });

  return router;
};

export default ExamRoute;
