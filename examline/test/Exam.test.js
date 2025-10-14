






























































// test/exams.test.ts
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import addRoutes from '../src/routes';
import bcrypt from 'bcryptjs';

// Mock PrismaClient
const prismaMock = {
  exam: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  examHistory: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  inscription: {
    findFirst: jest.fn()
  }
};

// Mock authentication middleware
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, rol: 'student', nombre: 'Test', email: 'test@test.com' };
    next();
  },
  requireRole: () => (req, res, next) => next(),
}));

const app = express();
app.use(cors());
app.use(express.json());
addRoutes(app, prismaMock);

describe('ExamRoute tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================= GET /exams/:examId =================
  it('GET /exams/:examId returns exam and registers history for students', async () => {
    prismaMock.exam.findUnique.mockResolvedValue({
      id: 1,
      titulo: 'Test Exam',
      profesorId: 2,
      preguntas: [{ id: 1, texto: 'Q1', opciones: ['a','b'], correcta: 0 }]
    });
    // Mock inscription data for student
    prismaMock.inscription = {
      findFirst: jest.fn().mockResolvedValue({
        userId: 1,
        examWindow: {
          estado: 'en_curso',
          fechaInicio: new Date(),
          duracion: 60,
          exam: { id: 1 }
        },
        presente: true
      })
    };
    
    const res = await request(app).get('/exams/1?windowId=1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('titulo', 'Test Exam');
    expect(prismaMock.examHistory.upsert).toHaveBeenCalled();
  });

  it('GET /exams/:examId returns 404 if exam not found', async () => {
    prismaMock.exam.findUnique.mockResolvedValue(null);
    // Mock inscription data for student
    prismaMock.inscription.findFirst.mockResolvedValue({
      userId: 1,
      examWindow: {
        estado: 'en_curso',
        fechaInicio: new Date(),
        duracion: 60,
        exam: { id: 999 }
      },
      presente: true
    });
    const res = await request(app).get('/exams/999?windowId=1');
    expect(res.statusCode).toBe(404);
  });

  it('GET /exams/:examId returns 400 for invalid examId', async () => {
    const res = await request(app).get('/exams/abc');
    expect(res.statusCode).toBe(400);
  });

  // ================= POST /exams/create =================
  it('POST /exams/create should create a new exam', async () => {
    prismaMock.exam.create.mockResolvedValue({
      id: 1,
      titulo: 'Nuevo Examen',
      profesorId: 1,
      preguntas: [{ id: 1, texto: 'Pregunta', opciones: ['a','b'], correcta: 0 }]
    });
    const res = await request(app)
      .post('/exams/create')
      .send({ titulo: 'Nuevo Examen', preguntas: [{ texto: 'Pregunta', opciones: ['a','b'], correcta: 0 }] });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('titulo', 'Nuevo Examen');
  });

  it('POST /exams/create should return 500 on error', async () => {
    prismaMock.exam.create.mockImplementation(() => { throw new Error('DB error'); });
    const res = await request(app)
      .post('/exams/create')
      .send({ titulo: 'Fail Exam', preguntas: [] });
    expect(res.statusCode).toBe(500);
  });

  // ================= GET /exams/history/:userId =================
  it('GET /exams/history/:userId returns history for student', async () => {
    prismaMock.examHistory.findMany.mockResolvedValue([{ examId: 1, viewedAt: new Date(), exam: { id: 1, titulo: 'Ex1' } }]);
    const res = await request(app).get('/exams/history/1');
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toHaveProperty('exam');
  });

  it('GET /exams/history/:userId returns 403 if student requests other user history', async () => {
    const res = await request(app).get('/exams/history/999');
    expect(res.statusCode).toBe(403);
  });

  it('GET /exams/history/:userId returns 400 for invalid userId', async () => {
    const res = await request(app).get('/exams/history/abc');
    expect(res.statusCode).toBe(400);
  });
});
