// test/inscription.test.js
import request from 'supertest';
import express from 'express';
import InscriptionRoute from '../src/routes/inscription.route.ts';

// Mock PrismaClient
const prismaMock = {
  examWindow: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  inscription: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

// Mock authentication middleware
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, rol: 'student', nombre: 'Test', email: 'test@test.com' };
    next();
  },
  requireRole: (roles) => (req, res, next) => next(),
}));

const app = express();
app.use(express.json());
app.use('/inscriptions', InscriptionRoute(prismaMock));

describe('InscriptionRoute tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================= POST / =================
  it('POST / should create new inscription', async () => {
    const fakeWindow = {
      id: 1,
      examId: 1,
      activa: true,
      estado: 'programada',
      sinTiempo: false,
      fechaInicio: new Date(Date.now() + 3600000), // dentro de 1h
      cupoMaximo: 10,
      inscripciones: [],
    };
    prismaMock.examWindow.findUnique.mockResolvedValue(fakeWindow);
    prismaMock.inscription.findFirst.mockResolvedValue(null);
    prismaMock.inscription.findUnique.mockResolvedValue(null);
    prismaMock.inscription.create.mockResolvedValue({
      id: 1,
      userId: 1,
      examWindowId: 1,
      examWindow: { ...fakeWindow, inscripciones: [{ id: 1 }] }
    });
    prismaMock.examWindow.update.mockResolvedValue({ id: 1, estado: 'programada' });

    const res = await request(app)
      .post('/inscriptions')
      .send({ examWindowId: 1 });

    expect(res.statusCode).toBe(201);
    expect(res.body.userId).toBe(1);
    expect(prismaMock.inscription.create).toHaveBeenCalled();
  });

  it('POST / should fail if already inscribed in another window', async () => {
    prismaMock.examWindow.findUnique.mockResolvedValue({ id: 1, examId: 1, activa: true, estado: 'programada', sinTiempo: true, inscripciones: [], cupoMaximo: 10 });
    prismaMock.inscription.findFirst.mockResolvedValue({ id: 2 });

    const res = await request(app)
      .post('/inscriptions')
      .send({ examWindowId: 1 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Ya estás inscrito/);
  });

  it('POST / should reactivate cancelled inscription', async () => {
    const fakeWindow = { id: 1, examId: 1, activa: true, estado: 'programada', sinTiempo: true, inscripciones: [], cupoMaximo: 10 };
    prismaMock.examWindow.findUnique.mockResolvedValue(fakeWindow);
    prismaMock.inscription.findFirst.mockResolvedValue(null);
    prismaMock.inscription.findUnique.mockResolvedValue({ id: 1, cancelledAt: new Date(), examWindow: { ...fakeWindow, inscripciones: [] } });
    prismaMock.inscription.update.mockResolvedValue({ id: 1, examWindow: { ...fakeWindow, inscripciones: [{ id: 1 }] } });
    prismaMock.examWindow.update.mockResolvedValue({ id: 1, estado: 'programada' });

    const res = await request(app)
      .post('/inscriptions')
      .send({ examWindowId: 1 });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(1);
  });

  // ================= GET /mis-inscripciones =================
  it('GET /mis-inscripciones should return inscriptions', async () => {
    prismaMock.inscription.findMany.mockResolvedValue([{ id: 1, examWindow: { exam: { titulo: 'Exam 1' } } }]);

    const res = await request(app).get('/inscriptions/mis-inscripciones');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ================= DELETE /:id =================
  it('DELETE /:id should cancel inscription', async () => {
    const fakeWindow = { id: 1, sinTiempo: true, estado: 'programada', cupoMaximo: 10, inscripciones: [] };
    prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, userId: 1, examWindow: fakeWindow });
    prismaMock.inscription.update.mockResolvedValue({ id: 1 });
    prismaMock.examWindow.findUnique.mockResolvedValue({ ...fakeWindow, inscripciones: [] });
    prismaMock.examWindow.update.mockResolvedValue({ id: 1, estado: 'programada' });

    const res = await request(app).delete('/inscriptions/1');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /:id should return 404 if inscription not found', async () => {
    prismaMock.inscription.findFirst.mockResolvedValue(null);

    const res = await request(app).delete('/inscriptions/99');

    expect(res.statusCode).toBe(404);
  });

  // ================= GET /ventana/:windowId =================
  it('GET /ventana/:windowId should return inscriptions for professor', async () => {
    // Mock user as professor
    app.use((req, res, next) => {
      req.user = { userId: 1, rol: 'professor' };
      next();
    });

    prismaMock.examWindow.findFirst.mockResolvedValue({ id: 1, exam: { profesorId: 1 } });
    prismaMock.inscription.findMany.mockResolvedValue([{ id: 1, user: { id: 2, nombre: 'Student', email: 's@test.com' } }]);

    const res = await request(app).get('/inscriptions/ventana/1');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
