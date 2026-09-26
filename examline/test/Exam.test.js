// test/exam.test.js
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import ExamRoute from '../src/routes/exam.route.ts';

// Mock PrismaClient
const prismaMock = {
  exam: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  examPart: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  pregunta: {
    createMany: jest.fn(),
  },
  examFile: {
    upsert: jest.fn(),
  },
  inscription: {
    findFirst: jest.fn(),
  },
  examHistory: {
    upsert: jest.fn(),
  },
};
// createExam corre dentro de una transacción; el mock simplemente ejecuta el
// callback pasándole el mismo prismaMock como cliente transaccional (tx).
prismaMock.$transaction = jest.fn((callback) => callback(prismaMock));

// Mock authentication middleware
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, rol: 'professor', nombre: 'Test', email: 'test@test.com' };
    next();
  },
  requireRole: (roles) => (req, res, next) => next(),
}));

// Mock CodeExecutionService
const mockRunTests = jest.fn();
jest.mock('../src/services/codeExecution.service.ts', () => {
  return jest.fn().mockImplementation(() => ({
    runTests: mockRunTests,
  }));
});

const app = express();
app.use(cors());
app.use(express.json());
app.use('/exams', ExamRoute(prismaMock));

describe('ExamRoute tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================= POST /create =================
  it('POST /create should create multiple choice exam', async () => {
    prismaMock.exam.create.mockResolvedValue({ id: 1, profesorId: 1 });
    prismaMock.examPart.create.mockResolvedValue({ id: 10 });
    prismaMock.pregunta.createMany.mockResolvedValue({ count: 1 });
    prismaMock.exam.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      titulo: 'Test Exam',
      tipo: 'multiple_choice',
      profesorId: 1,
      partes: [{ id: 10, orden: 1, tipo: 'multiple_choice', preguntas: [{ id: 1, texto: 'Q1' }] }],
    });

    const res = await request(app)
      .post('/exams/create')
      .send({
        titulo: 'Test Exam',
        partes: [
          {
            orden: 1,
            tipo: 'multiple_choice',
            preguntas: [{ texto: 'Q1', correcta: 0, opciones: ['a', 'b'] }],
          },
        ],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.tipo).toBe('multiple_choice');
    expect(prismaMock.exam.create).toHaveBeenCalled();
  });

  it('POST /create should fail if programming exam missing language', async () => {
    const res = await request(app)
      .post('/exams/create')
      .send({ titulo: 'Prog Exam', partes: [{ orden: 1, tipo: 'programming' }] });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/lenguaje/);
  });

  it('POST /create should create programming exam with reference files', async () => {
    prismaMock.exam.create.mockResolvedValue({ id: 2, profesorId: 1 });
    prismaMock.examPart.create.mockResolvedValue({ id: 20 });
    prismaMock.exam.findUniqueOrThrow.mockResolvedValue({
      id: 2,
      titulo: 'Prog Exam',
      tipo: 'programming',
      profesorId: 1,
      partes: [{ id: 20, orden: 1, tipo: 'programming', preguntas: [] }],
    });

    prismaMock.examFile.upsert.mockResolvedValue({});

    const res = await request(app)
      .post('/exams/create')
      .send({
        titulo: 'Prog Exam',
        partes: [
          {
            orden: 1,
            tipo: 'programming',
            lenguajeProgramacion: 'python',
            enunciadoProgramacion: 'Do something',
          },
        ],
        referenceFiles: [
          { filename: 'solution.py', content: 'print("hi")' },
        ],
      });

    expect(res.statusCode).toBe(201);
    expect(prismaMock.examFile.upsert).toHaveBeenCalled();
  });

  // ================= GET / =================
  it('GET / should return exams for professor', async () => {
    prismaMock.exam.findMany.mockResolvedValue([{ id: 1, titulo: 'Exam1', partes: [] }]);

    const res = await request(app).get('/exams');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(prismaMock.exam.findMany).toHaveBeenCalled();
  });

  // ================= GET /:examId =================
  it('GET /:examId should return exam for professor', async () => {
    prismaMock.exam.findUnique.mockResolvedValue({
      id: 1,
      tipo: 'multiple_choice',
      profesorId: 1,
      partes: [],
    });

    const res = await request(app).get('/exams/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
  });

  // ================= POST /parts/:partId/test-solution =================
  it('POST /parts/:partId/test-solution should run tests for programming exam', async () => {
    prismaMock.examPart.findUnique.mockResolvedValue({
      id: 10,
      tipo: 'programming',
      testCases: [{ input: '1+1', expectedOutput: '2' }],
      lenguajeProgramacion: 'python',
      solucionReferencia: 'print(2)',
      exam: { profesorId: 1 },
    });

    mockRunTests.mockResolvedValue({ score: 100, passedTests: 1, totalTests: 1 });

    const res = await request(app)
      .post('/exams/parts/10/test-solution')
      .send({ useReferenceSolution: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRunTests).toHaveBeenCalled();
  });

  // ================= POST /test-solution-preview =================
  it('POST /test-solution-preview should run preview tests', async () => {
    mockRunTests.mockResolvedValue({ score: 100, passedTests: 1, totalTests: 1 });

    const res = await request(app)
      .post('/exams/test-solution-preview')
      .send({
        code: 'print(2)',
        language: 'python',
        testCases: [{ input: '', expectedOutput: '2' }],
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRunTests).toHaveBeenCalled();
  });

  // ================= PUT /parts/:partId/reference-solution =================
  it('PUT /parts/:partId/reference-solution should update reference solution', async () => {
    prismaMock.examPart.findUnique.mockResolvedValue({
      id: 10,
      tipo: 'programming',
      exam: { profesorId: 1 },
    });

    prismaMock.examPart.update.mockResolvedValue({
      id: 10,
      solucionReferencia: 'print(2)',
    });

    const res = await request(app)
      .put('/exams/parts/10/reference-solution')
      .send({ solucionReferencia: 'print(2)' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.examPart.update).toHaveBeenCalled();
  });
});
