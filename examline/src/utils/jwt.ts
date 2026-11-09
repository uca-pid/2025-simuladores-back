import jwt, { type JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN; // 2 hours as requested

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET no está definido en las variables de entorno");
}

if (!JWT_EXPIRES_IN) {
  throw new Error("JWT_EXPIRES_IN no está definido en las variables de entorno");
}

export interface JWTPayload {
  userId: number;
  email: string;
  nombre: string;
  rol: string;
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'examline-app'
  });
};

export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload & { scope?: string };
    // Los tokens de vista previa de SEB solo sirven para ver ese examen, nunca como sesión
    if (decoded.scope === 'seb-preview') {
      return null;
    }
    return decoded;
  } catch (error) {
    // Solo loguear en desarrollo o si es un error diferente a token expirado
    if (process.env.NODE_ENV === 'development' || !(error instanceof Error && error.name === 'TokenExpiredError')) {
      console.error('JWT verification error:', error);
    }
    return null;
  }
};

export const refreshToken = (payload: JWTPayload): string => {
  // Create a new token with the same payload but fresh expiry
  return generateToken(payload);
};

/**
 * Token corto (10 minutos) para que el profesor vea un examen dentro de SEB al
 * probar la configuración: SEB abre su propio navegador, sin la sesión del profe.
 */
export const generateSEBPreviewToken = (userId: number, examId: number): string => {
  return jwt.sign(
    { scope: 'seb-preview', userId, examId },
    JWT_SECRET,
    { expiresIn: '10m', issuer: 'examline-app', audience: 'seb-preview' }
  );
};

/** Devuelve el profesor del token de vista previa si es válido para ese examen, o null. */
export const verifySEBPreviewToken = (token: string, examId: number): number | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: 'examline-app',
      audience: 'seb-preview'
    }) as JwtPayload & { scope?: string; userId?: number; examId?: number };

    if (payload.scope !== 'seb-preview' || payload.examId !== examId || !Number.isInteger(payload.userId)) {
      return null;
    }

    return payload.userId!;
  } catch {
    return null;
  }
};