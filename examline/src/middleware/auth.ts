import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt.ts';
import { PrismaClient } from '@prisma/client';

// Extend the Request interface to include user info
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Token de acceso requerido',
      code: 'NO_TOKEN'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ 
      error: 'Token inválido o expirado',
      code: 'INVALID_TOKEN'
    });
  }

  req.user = decoded;
  next();
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Usuario no autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para acceder a este recurso',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// 🔒 Middleware para verificar la propiedad de recursos
// Verifica que el profesor autenticado sea el dueño del recurso solicitado
export const requireOwnership = (prisma: PrismaClient, resourceType: 'exam' | 'examWindow' | 'questionBank') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Usuario no autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // System users pueden acceder a cualquier recurso
    if (req.user.rol === 'system') {
      return next();
    }

    // Solo profesores tienen recursos que poseer (estudiantes usan inscripciones)
    if (req.user.rol !== 'professor') {
      return res.status(403).json({ 
        error: 'No tienes permisos para acceder a este recurso',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    try {
      let resourceId: number;
      let isOwner = false;

      switch (resourceType) {
        case 'exam':
          // examId puede estar en params o body (para updates)
          resourceId = parseInt(req.params.examId || req.body.examId);
          if (isNaN(resourceId)) {
            return res.status(400).json({ error: 'ID de examen inválido' });
          }

          const exam = await prisma.exam.findUnique({
            where: { id: resourceId },
            select: { profesorId: true }
          });

          if (!exam) {
            return res.status(404).json({ 
              error: 'Examen no encontrado',
              code: 'EXAM_NOT_FOUND'
            });
          }

          isOwner = exam.profesorId === req.user.userId;
          break;

        case 'examWindow':
          resourceId = parseInt(req.params.windowId || req.body.windowId);
          if (isNaN(resourceId)) {
            return res.status(400).json({ error: 'ID de ventana inválido' });
          }

          const window = await prisma.examWindow.findUnique({
            where: { id: resourceId },
            include: { exam: { select: { profesorId: true } } }
          });

          if (!window) {
            return res.status(404).json({ 
              error: 'Ventana de examen no encontrada',
              code: 'WINDOW_NOT_FOUND'
            });
          }

          isOwner = window.exam.profesorId === req.user.userId;
          break;

        case 'questionBank':
          resourceId = parseInt(req.params.questionId || req.body.questionId);
          if (isNaN(resourceId)) {
            return res.status(400).json({ error: 'ID de pregunta inválido' });
          }

          const question = await prisma.questionBank.findUnique({
            where: { id: resourceId },
            select: { profesorId: true }
          });

          if (!question) {
            return res.status(404).json({ 
              error: 'Pregunta no encontrada',
              code: 'QUESTION_NOT_FOUND'
            });
          }

          isOwner = question.profesorId === req.user.userId;
          break;

        default:
          return res.status(400).json({ error: 'Tipo de recurso no soportado' });
      }

      if (!isOwner) {
        return res.status(403).json({ 
          error: 'No tienes permisos para acceder a este recurso',
          code: 'NOT_OWNER'
        });
      }

      next();
    } catch (error) {
      console.error('Error verificando propiedad:', error);
      res.status(500).json({ error: 'Error al verificar permisos' });
    }
  };
};