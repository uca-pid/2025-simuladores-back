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
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
};

export const refreshToken = (payload: JWTPayload): string => {
  // Create a new token with the same payload but fresh expiry
  return generateToken(payload);
};