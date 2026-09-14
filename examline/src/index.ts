import 'dotenv/config'; // Load environment variables first

// Configurar zona horaria del servidor para Argentina
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { PrismaClient } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors'; // Importar CORS
import { createServer } from 'http';
import addRoutes from './routes'; // Asegúrate de que esta ruta sea correcta

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

// Configuración de CORS
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// Ruta de ejemplo
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hola, Express!' });
});

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
