import 'dotenv/config'; // Load environment variables first
import { PrismaClient } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors'; // Importar CORS
import { createServer } from 'http';
import addRoutes from './routes'; // Asegúrate de que esta ruta sea correcta

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

// Configuración de WebSocket
const setupSocketIO = async () => {
  try {
    // Importar dinámicamente Socket.IO
    const { Server } = await import('socket.io');
    const { verifyToken } = await import('./utils/jwt.js');
    const { setSocketIO } = await import('./routes/examWindow.route.js');
    
    const io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    // Middleware de autenticación para Socket.IO
    io.use(async (socket: any, next: any) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('No token provided'));
        }

        const decoded = verifyToken(token);
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
          console.log(`👨‍🏫 Profesor ${socket.userId} se unió a sala: ${roomName}`);
        }
      });

      // Manejar desconexión
      socket.on('disconnect', () => {
        console.log(`🔴 Usuario desconectado: ${socket.userId}`);
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
