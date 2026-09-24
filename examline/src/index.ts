import 'dotenv/config'; // Load environment variables first

// Configurar zona horaria del servidor para Argentina
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { PrismaClient } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors'; // Importar CORS
import { createServer } from 'http';
import addRoutes from './routes'; // Asegúrate de que esta ruta sea correcta

// Reintenta automáticamente cualquier query que falle por P1001 ("Can't reach
// database server"): pasa cuando Neon (plan free) suspendió el compute por
// inactividad y la request golpea la conexión justo mientras se está
// "despertando" de nuevo, en cualquier momento durante el uso del server
// (no solo al arrancar).
const MAX_QUERY_RETRIES = 3;
const RETRY_DELAY_MS = 1500;
const prisma = new PrismaClient().$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      for (let intento = 1; intento <= MAX_QUERY_RETRIES; intento++) {
        try {
          return await query(args);
        } catch (error: any) {
          const isConnectionError = error?.code === 'P1001';
          if (!isConnectionError || intento === MAX_QUERY_RETRIES) throw error;
          console.warn(`⏳ Conexión a la base perdida, reintentando ${model}.${operation} (${intento}/${MAX_QUERY_RETRIES})...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    },
  },
}) as unknown as PrismaClient;
const app = express();
const httpServer = createServer(app);

// Espera a que la base de datos esté disponible antes de aceptar tráfico.
// Neon (plan free) suspende el compute cuando está inactivo; la primera
// conexión después de eso tarda unos segundos en "despertarlo".
async function waitForDatabase(retries = 5, delayMs = 2000) {
  for (let intento = 1; intento <= retries; intento++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Conexión a la base de datos establecida');
      return;
    } catch (error) {
      console.warn(`⏳ Esperando a la base de datos (intento ${intento}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  console.error('❌ No se pudo conectar a la base de datos tras varios intentos');
}

// Configuración de CORS
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// Ruta de ejemplo
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hola, Express!' });
});

// Función para loguear errores
function logErrors(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(err.stack);
  next(err);
}

// Manejo de errores
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  res.status(500).send({ errors: [{ message: "Something went wrong" }] });
}

// Iniciar el servidor una vez confirmada la conexión a la base de datos,
// para que las rutas y los timers de examWindow no arranquen contra una
// conexión todavía no establecida (cold start de Neon)
const PORT = process.env.PORT || 4000;
waitForDatabase().then(() => {
  // Añadir otras rutas desde addRoutes
  addRoutes(app, prisma);

  // Middleware para loguear y manejar errores
  app.use(logErrors);
  app.use(errorHandler);

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready at: http://localhost:${PORT}`);
  });
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
