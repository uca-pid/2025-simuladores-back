/**
 * Moodle Integration Routes
 * Rutas para sincronizar calificaciones de Examline con Moodle
 */

import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.ts";
import MoodleService from "../services/moodle.service.ts";

const MoodleRoute = (prisma: PrismaClient) => {
  const router = Router();
  const moodleService = new MoodleService();

  // POST /moodle/verify - Verificar conexión con Moodle
  router.post("/verify", authenticateToken, requireRole(['professor']), async (req, res) => {
    const { moodleUrl, moodleToken } = req.body;

    if (!moodleUrl || !moodleToken) {
      return res.status(400).json({ error: "URL y token de Moodle son requeridos" });
    }

    try {
      const result = await moodleService.verifyMoodleConnection({
        moodleUrl,
        wsToken: moodleToken
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error verifying Moodle connection:', error);
      res.status(500).json({ 
        success: false,
        error: "Error verificando conexión con Moodle" 
      });
    }
  });

  // GET /moodle/courses/:courseId - Obtener información de un curso de Moodle
  router.get("/courses/:courseId", authenticateToken, requireRole(['professor']), async (req, res) => {
    const courseId = parseInt(req.params.courseId);
    const { moodleUrl, moodleToken } = req.query;

    if (!moodleUrl || !moodleToken) {
      return res.status(400).json({ error: "URL y token de Moodle son requeridos" });
    }

    try {
      const course = await moodleService.getCourseInfo(
        { moodleUrl: moodleUrl as string, wsToken: moodleToken as string },
        courseId
      );

      res.json(course);
    } catch (error: any) {
      console.error('Error getting course info:', error);
      res.status(500).json({ error: "Error obteniendo información del curso" });
    }
  });

  // GET /moodle/courses/:courseId/assignments - Obtener tareas de un curso
  router.get("/courses/:courseId/assignments", authenticateToken, requireRole(['professor']), async (req, res) => {
    const courseId = parseInt(req.params.courseId);
    const { moodleUrl, moodleToken, useContents } = req.query;

    console.log('📚 Intentando cargar tareas:', { 
      courseId, 
      moodleUrl: moodleUrl ? 'presente' : 'faltante',
      useContents: useContents === 'true' 
    });

    if (!moodleUrl || !moodleToken) {
      return res.status(400).json({ error: "URL y token de Moodle son requeridos" });
    }

    if (isNaN(courseId)) {
      return res.status(400).json({ error: "ID de curso inválido" });
    }

    try {
      let activities;
      
      // Si useContents=true, usar método alternativo
      if (useContents === 'true') {
        console.log('📖 Usando core_course_get_contents (método alternativo)');
        activities = await moodleService.getCourseContents(
          { moodleUrl: moodleUrl as string, wsToken: moodleToken as string },
          courseId
        );
      } else {
        console.log('📋 Usando mod_assign_get_assignments (método por defecto)');
        try {
          activities = await moodleService.getCourseAssignments(
            { moodleUrl: moodleUrl as string, wsToken: moodleToken as string },
            courseId
          );
          
          // Si no hay assignments, intentar con el método alternativo
          if (activities.length === 0) {
            console.log('⚠️ No se encontraron assignments, intentando método alternativo...');
            activities = await moodleService.getCourseContents(
              { moodleUrl: moodleUrl as string, wsToken: moodleToken as string },
              courseId
            );
          }
        } catch (assignError: any) {
          console.log('⚠️ Error con mod_assign_get_assignments, usando método alternativo');
          activities = await moodleService.getCourseContents(
            { moodleUrl: moodleUrl as string, wsToken: moodleToken as string },
            courseId
          );
        }
      }

      console.log('✅ Actividades obtenidas:', activities.length);
      res.json(activities);
    } catch (error: any) {
      console.error('❌ Error getting assignments:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response
      });
      res.status(500).json({ 
        error: "Error obteniendo tareas del curso",
        details: error.message 
      });
    }
  });

  // PUT /moodle/exam-windows/:windowId/config - Configurar Moodle para una ventana
  router.put("/exam-windows/:windowId/config", authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.windowId);
    const { moodleUrl, moodleToken, moodleCourseId, moodleActivityId, moodleSyncEnabled } = req.body;

    if (isNaN(windowId)) {
      return res.status(400).json({ error: "ID de ventana inválido" });
    }

    try {
      // Verificar que la ventana existe y pertenece al profesor
      const window = await prisma.examWindow.findUnique({
        where: { id: windowId },
        include: { exam: true }
      });

      if (!window) {
        return res.status(404).json({ error: "Ventana no encontrada" });
      }

      if (window.exam.profesorId !== req.user!.userId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      // Si se está habilitando la sincronización, verificar la conexión
      if (moodleSyncEnabled && moodleUrl && moodleToken) {
        const verification = await moodleService.verifyMoodleConnection({
          moodleUrl,
          wsToken: moodleToken
        });

        if (!verification.success) {
          return res.status(400).json({ 
            error: "No se pudo verificar la conexión con Moodle",
            details: verification.error
          });
        }
      }

      // Actualizar configuración
      const updatedWindow = await prisma.examWindow.update({
        where: { id: windowId },
        data: {
          moodleUrl: moodleUrl || null,
          moodleToken: moodleToken || null,
          moodleCourseId: moodleCourseId || null,
          moodleActivityId: moodleActivityId || null,
          moodleSyncEnabled: moodleSyncEnabled || false
        }
      });

      res.json({
        message: "Configuración de Moodle actualizada",
        window: updatedWindow
      });
    } catch (error: any) {
      console.error('Error updating Moodle config:', error);
      res.status(500).json({ error: "Error actualizando configuración de Moodle" });
    }
  });

  // POST /moodle/exam-windows/:windowId/sync-grades - Sincronizar calificaciones con Moodle
  router.post("/exam-windows/:windowId/sync-grades", authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.windowId);

    if (isNaN(windowId)) {
      return res.status(400).json({ error: "ID de ventana inválido" });
    }

    try {
      // Obtener ventana con configuración de Moodle
      // Primero obtener la ventana para conocer el examId
      const window = await prisma.examWindow.findUnique({
        where: { id: windowId },
        include: { 
          exam: true
        }
      });

      if (!window) {
        return res.status(404).json({ error: "Ventana no encontrada" });
      }

      // Ahora obtener los intentos SOLO del examen correcto de esta ventana
      const windowWithAttempts = await prisma.examWindow.findUnique({
        where: { id: windowId },
        include: { 
          exam: true,
          intentos: {
            where: {
              examId: window.examId,        // ✅ VERIFICAR que sea del examen correcto
              examWindowId: windowId,       // ✅ Y que sea de esta ventana específica
              estado: 'finalizado',
              puntaje: { not: null }
            },
            include: {
              user: true
            }
          }
        }
      });

      if (!windowWithAttempts) {
        return res.status(404).json({ error: "Ventana no encontrada" });
      }

      if (windowWithAttempts.exam.profesorId !== req.user!.userId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      // Verificar configuración de Moodle
      if (!windowWithAttempts.moodleUrl || !windowWithAttempts.moodleToken || !windowWithAttempts.moodleActivityId) {
        return res.status(400).json({ 
          error: "La sincronización con Moodle no está configurada para esta ventana" 
        });
      }

      // Preparar calificaciones SOLO del examen correcto
      // Usar calificacionManual si existe, sino puntaje automático
      const grades = windowWithAttempts.intentos.map(attempt => {
        const notaFinal = attempt.calificacionManual !== null && attempt.calificacionManual !== undefined
          ? attempt.calificacionManual
          : (attempt.puntaje || 0);
        
        return {
          studentId: '', // Se obtendrá por email
          studentEmail: attempt.user.email,
          grade: notaFinal
        };
      });

      if (grades.length === 0) {
        return res.status(400).json({ 
          error: "No hay calificaciones para sincronizar" 
        });
      }

      // Enviar calificaciones a Moodle
      const results = await moodleService.sendBulkGrades(
        {
          moodleUrl: windowWithAttempts.moodleUrl!,
          wsToken: windowWithAttempts.moodleToken!
        },
        windowWithAttempts.moodleActivityId!,
        grades
      );

      // Contar éxitos y fallos
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      // Actualizar timestamp de última sincronización
      await prisma.examWindow.update({
        where: { id: windowId },
        data: { lastMoodleSync: new Date() }
      });

      res.json({
        message: `Sincronización completada: ${successful} exitosas, ${failed} fallidas`,
        successful,
        failed,
        totalAttempts: grades.length,
        results: results,
        lastSync: new Date()
      });
    } catch (error: any) {
      console.error('Error syncing grades with Moodle:', error);
      res.status(500).json({ 
        error: "Error sincronizando calificaciones con Moodle",
        details: error.message
      });
    }
  });

  // GET /moodle/exam-windows/:windowId/sync-status - Estado de sincronización
  router.get("/exam-windows/:windowId/sync-status", authenticateToken, requireRole(['professor']), async (req, res) => {
    const windowId = parseInt(req.params.windowId);

    if (isNaN(windowId)) {
      return res.status(400).json({ error: "ID de ventana inválido" });
    }

    try {
      // Primero obtener la ventana para conocer el examId
      const window = await prisma.examWindow.findUnique({
        where: { id: windowId },
        include: { 
          exam: true
        }
      });

      if (!window) {
        return res.status(404).json({ error: "Ventana no encontrada" });
      }

      if (window.exam.profesorId !== req.user!.userId) {
        return res.status(403).json({ error: "No autorizado" });
      }

      // Contar intentos SOLO del examen correcto de esta ventana
      const attemptsCount = await prisma.examAttempt.count({
        where: {
          examId: window.examId,        // ✅ Del examen correcto
          examWindowId: windowId,       // ✅ De esta ventana
          estado: 'finalizado',
          puntaje: { not: null }
        }
      });

      res.json({
        moodleSyncEnabled: window.moodleSyncEnabled,
        moodleConfigured: !!(window.moodleUrl && window.moodleToken && window.moodleActivityId),
        lastMoodleSync: window.lastMoodleSync,
        totalGrades: attemptsCount,
        moodleUrl: window.moodleUrl,
        moodleCourseId: window.moodleCourseId,
        moodleActivityId: window.moodleActivityId
      });
    } catch (error: any) {
      console.error('Error getting sync status:', error);
      res.status(500).json({ error: "Error obteniendo estado de sincronización" });
    }
  });

  return router;
};

export default MoodleRoute;
