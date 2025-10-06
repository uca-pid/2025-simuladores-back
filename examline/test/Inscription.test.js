// test/Inscription.test.js
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import addRoutes from '../src/routes';

// Mock PrismaClient
const prismaMock = {
  inscription: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  examWindow: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  }
};

// Mock authentication middleware for student role
const mockAuthStudent = (req, res, next) => {
  req.user = { userId: 1, rol: 'student', nombre: 'Test Student' };
  next();
};

// Mock authentication middleware for professor role
const mockAuthProfessor = (req, res, next) => {
  req.user = { userId: 2, rol: 'professor', nombre: 'Test Professor' };
  next();
};

// Mock middleware
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireRole: (roles) => (req, res, next) => {
    if (roles.includes('student')) {
      return mockAuthStudent(req, res, next);
    }
    if (roles.includes('professor')) {
      return mockAuthProfessor(req, res, next);
    }
    next();
  },
}));

const app = express();
app.use(cors());
app.use(express.json());
addRoutes(app, prismaMock);

describe('InscriptionRoute tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================= POST / (Create inscription) =================
  it('POST / should create a new inscription for student', async () => {
    // Mock examWindow data
    const mockExamWindow = {
      id: 1,
      activa: true,
      estado: 'programada',
      fechaInicio: new Date(Date.now() + 86400000), // tomorrow
      cupoMaximo: 10,
      inscripciones: [],
    };

    prismaMock.examWindow.findUnique.mockResolvedValue(mockExamWindow);
    prismaMock.inscription.findUnique.mockResolvedValue(null); // no existing inscription
    
    const mockInscription = {
      id: 1,
      userId: 1,
      examWindowId: 1,
      examWindow: {
        ...mockExamWindow,
        exam: { titulo: 'Test Exam' }
      }
    };
    prismaMock.inscription.create.mockResolvedValue(mockInscription);

    const res = await request(app)
      .post('/inscriptions')
      .send({ examWindowId: 1 });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id', 1);
    expect(prismaMock.inscription.create).toHaveBeenCalled();
  });

  it('POST / should fail if window is not active', async () => {
    prismaMock.examWindow.findUnique.mockResolvedValue({
      activa: false,
      estado: 'programada',
      fechaInicio: new Date(Date.now() + 86400000),
    });

    const res = await request(app)
      .post('/inscriptions')
      .send({ examWindowId: 1 });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST / should fail if window has started', async () => {
    prismaMock.examWindow.findUnique.mockResolvedValue({
      activa: true,
      estado: 'programada',
      fechaInicio: new Date(Date.now() - 86400000), // yesterday
    });

    const res = await request(app)
      .post('/inscriptions')
      .send({ examWindowId: 1 });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // ================= GET /mis-inscripciones =================
  it('GET /mis-inscripciones should return student inscriptions', async () => {
    const mockInscriptions = [{
      id: 1,
      examWindow: {
        exam: {
          id: 1,
          titulo: 'Test Exam',
          profesor: { nombre: 'Test Prof' }
        }
      }
    }];

    prismaMock.inscription.findMany.mockResolvedValue(mockInscriptions);

    const res = await request(app).get('/inscriptions/mis-inscripciones');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].examWindow.exam.titulo).toBe('Test Exam');
  });

  // ================= DELETE /:id (Cancel inscription) =================
  it('DELETE /:id should cancel inscription', async () => {
    const mockInscription = {
      id: 1,
      userId: 1,
      examWindow: {
        fechaInicio: new Date(Date.now() + 86400000),
        exam: { titulo: 'Test Exam' }
      }
    };

    prismaMock.inscription.findFirst.mockResolvedValue(mockInscription);
    prismaMock.inscription.update.mockResolvedValue({ ...mockInscription, cancelledAt: new Date() });

    const res = await request(app).delete('/inscriptions/1');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(prismaMock.inscription.update).toHaveBeenCalled();
  });

  it('DELETE /:id should fail if window has started', async () => {
    prismaMock.inscription.findFirst.mockResolvedValue({
      id: 1,
      userId: 1,
      examWindow: {
        fechaInicio: new Date(Date.now() - 86400000), // yesterday
        exam: { titulo: 'Test Exam' }
      }
    });

    const res = await request(app).delete('/inscriptions/1');

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // ================= GET /ventana/:windowId =================
  it('GET /ventana/:windowId should return window inscriptions for professor', async () => {
    const mockExamWindow = {
      id: 1,
      exam: {
        profesorId: 2 // matches mock professor ID
      }
    };

    const mockInscriptions = [{
      id: 1,
      user: {
        id: 1,
        nombre: 'Test Student',
        email: 'student@test.com'
      }
    }];

    prismaMock.examWindow.findFirst.mockResolvedValue(mockExamWindow);
    prismaMock.inscription.findMany.mockResolvedValue(mockInscriptions);

    const res = await request(app).get('/inscriptions/ventana/1');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].user.nombre).toBe('Test Student');
  });

  // ================= PATCH /:id/asistencia =================
  it('PATCH /:id/asistencia should mark attendance', async () => {
    const mockInscription = {
      id: 1,
      examWindow: {
        exam: {
          profesorId: 2 // matches mock professor ID
        }
      }
    };

    prismaMock.inscription.findFirst.mockResolvedValue(mockInscription);
    prismaMock.inscription.update.mockResolvedValue({ ...mockInscription, presente: true });

    const res = await request(app)
      .patch('/inscriptions/1/asistencia')
      .send({ presente: true });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('presente', true);
  });

  it('PATCH /:id/asistencia should fail if not professor of exam', async () => {
    // Mock that inscription exists but professor doesn't have permission
    prismaMock.inscription.findFirst.mockResolvedValue(null); // No permission
    prismaMock.inscription.findUnique.mockResolvedValue({ 
      id: 1 
    }); // But inscription exists

    const res = await request(app)
      .patch('/inscriptions/1/asistencia')
      .send({ presente: true });

    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('error', 'No tienes permisos para esta inscripción');
  });
});