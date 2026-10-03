import rateLimit from "express-rate-limit";

// Limita intentos de login por IP para mitigar fuerza bruta.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesión. Intentá de nuevo en unos minutos." },
});

// Limita registros por IP para evitar creación masiva de cuentas.
export const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de registro. Intentá de nuevo más tarde." },
});

// Limita pedidos de recuperación de contraseña por IP.
export const forgotPasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intentá de nuevo en unos minutos." },
});
