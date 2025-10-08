import 'dotenv/config'; // Load environment variables first

// Configurar zona horaria del servidor para Argentina
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { PrismaClient } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors'; // Importar CORS
import { createServer } from 'http';
import addRoutes from './routes'; // Asegúrate de que esta ruta sea correcta

// Verificar que la zona horaria se configuró correctamente
console.log('🌍 Zona horaria del servidor:', process.env.TZ);
console.log('📅 Fecha actual del servidor:', new Date().toLocaleString('es-AR'));
console.log('⏰ Fecha UTC:', new Date().toISOString());

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

// Configuración de WebSocket
const setupSocketIO = async () => {
  try {
    // Importar dinámicamente Socket.IO
    const { Server } = await import('socket.io');
    const { verifyToken } = await import('./utils/jwt.ts');
    const { setSocketIO } = await import('./routes/examWindow.route.ts');

    const io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      // 🚀 CONFIGURACIONES ULTRA-BAJA LATENCIA (milisegundos)
      pingTimeout: 60000,         // 60s timeout para mantener conexión
      pingInterval: 5000,         // 5s ping para latencia mínima
      upgradeTimeout: 3000,       // 3s timeout rápido para upgrade
      maxHttpBufferSize: 512,     // Buffer ultra-pequeño (512 bytes)
      allowEIO3: true,           // Compatibilidad Engine.IO v3
      transports: ['websocket'], // SOLO WebSocket - máxima velocidad
      allowUpgrades: true,       // Permitir upgrades rápidos
      cookie: false             // Sin cookies - reducir overhead
    });

    // Middleware de autenticación para Socket.IO
    io.use(async (socket: any, next: any) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('No token provided'));
        }

        const decoded = verifyToken(token);
        if (!decoded) {
          return next(new Error('Token verification failed'));
        }
        socket.userId = decoded.userId;
        socket.userRole = decoded.rol;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    // Eventos de conexión
    io.on('connection', (socket: any) => {
      console.log(`🟢 Usuario conectado via WebSocket: ${socket.userId} (${socket.userRole})`);

      // Unir a sala específica de profesor
      socket.on('join_professor_room', () => {
        if (socket.userRole === 'professor') {
          const roomName = `professor_${socket.userId}`;
          socket.join(roomName);
          console.log(`👨‍🏫 Profesor ${socket.userId} se unió a sala ULTRA-RÁPIDA: ${roomName}`);
        }
      });

      // 🚀 Sistema de medición de latencia en tiempo real
      socket.on('ping', (timestamp: number) => {
        const receiveTime = Date.now();
        const processingStart = process.hrtime.bigint();
        
        // Responder inmediatamente con pong
        socket.emit('pong', {
          clientTimestamp: timestamp,
          serverReceiveTime: receiveTime,
          serverSendTime: Date.now(),
          processingTime: Number(process.hrtime.bigint() - processingStart) / 1000000
        });
      });

      // Enviar ping periódico para medir latencia
      const latencyInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('latency_ping', Date.now());
        }
      }, 10000); // Cada 10 segundos

      // Manejar desconexión
      socket.on('disconnect', () => {
        console.log(`🔴 Usuario desconectado: ${socket.userId}`);
        if (latencyInterval) {
          clearInterval(latencyInterval);
        }
      });
    });

    // Configurar Socket.IO en el módulo de exam windows
    setSocketIO(io);
    console.log('✅ Socket.IO configurado correctamente para tiempo real');

    return io;
  } catch (error) {
    console.log('⚠️ Socket.IO no disponible, funcionando sin WebSocket');
    console.log('💡 Para habilitar tiempo real: npm install socket.io');
    return null;
  }
};

// Configuración de CORS
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// Ruta de ejemplo
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hola, Express!' });
});

// Inicializar WebSocket
setupSocketIO();

// Añadir otras rutas desde addRoutes
addRoutes(app, prisma);

// Función para loguear errores
function logErrors(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(err.stack);
  next(err);
}

// Manejo de errores
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  res.status(500).send({ errors: [{ message: "Something went wrong" }] });
}

// Middleware para loguear y manejar errores
app.use(logErrors);
app.use(errorHandler);

// Iniciar el servidor
const PORT = process.env.PORT || 4000; 
const server = httpServer.listen(PORT, () => {
  console.log(`🚀 Server ready at: http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready for real-time updates`);
});

// Cerrar la conexión de Prisma cuando se cierra el servidor
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
