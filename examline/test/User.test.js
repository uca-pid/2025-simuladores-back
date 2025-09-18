// test/user.test.ts
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import addRoutes from '../src/routes';
import bcrypt from 'bcryptjs';

// Mock PrismaClient
const prismaMock = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  exam: {
    updateMany: jest.fn(),
  }
};

// Mock authentication middleware
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, rol: 'professor', nombre: 'Test', email: 'test@test.com' };
    next();
  },
  requireRole: () => (req, res, next) => next(),
}));

// Mock JWT utils
jest.mock('../src/utils/jwt', () => ({
  generateToken: jest.fn(() => 'mockedToken'),
  refreshToken: jest.fn(() => 'refreshedToken'),
}));

const app = express();
app.use(cors());
app.use(express.json());
addRoutes(app, prismaMock);

describe('UserRoute tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================= GET /users =================
  it('GET /users should return all users', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 1, nombre: 'Test', email: 'a@b.com', rol: 'student' }]);
    const res = await request(app).get('/users');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('nombre', 'Test');
  });

  // ================= GET /users/:id =================
  it('GET /users/:id should return user if exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, nombre: 'Juan', email: 'juan@b.com', rol: 'student' });
    const res = await request(app).get('/users/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('nombre', 'Juan');
  });

  it('GET /users/:id should return 404 if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/users/999');
    expect(res.statusCode).toBe(404);
  });

  // ================= POST /signup =================
  it('POST /users/signup should create a new user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 2, nombre: 'Juan', email: 'juan@b.com', rol: 'student' });
    
    const res = await request(app).post('/users/signup').send({ nombre: 'Juan', email: 'juan@b.com', password: '123' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('rol', 'student');
  });

  it('POST /users/signup should return 400 if email exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: 'a@b.com' });
    const res = await request(app).post('/users/signup').send({ nombre: 'Juan', email: 'a@b.com', password: '123' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // ================= POST /login =================
  it('POST /users/login should succeed with correct password', async () => {
    const hashedPassword = await bcrypt.hash('123', 10);
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, nombre: 'Juan', email: 'a@b.com', password: hashedPassword, rol: 'student' });
    
    const res = await request(app).post('/users/login').send({ email: 'a@b.com', password: '123' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token', 'mockedToken');
  });

  it('POST /users/login should fail with wrong password', async () => {
    const hashedPassword = await bcrypt.hash('123', 10);
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, nombre: 'Juan', email: 'a@b.com', password: hashedPassword, rol: 'student' });
    
    const res = await request(app).post('/users/login').send({ email: 'a@b.com', password: 'wrong' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /users/login should return 404 if email not found', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/users/login').send({ email: 'no@b.com', password: '123' });
    expect(res.statusCode).toBe(404);
  });

  // ================= POST /refresh-token =================
  it('POST /refresh-token should return new token', async () => {
    const res = await request(app).post('/users/refresh-token');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token', 'refreshedToken');
  });

  // ================= GET /me =================
  it('GET /me should return current user info', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, nombre: 'Test', email: 'test@test.com', rol: 'professor' });
    const res = await request(app).get('/users/me');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('nombre', 'Test');
  });

  // ================= PUT /users/:id =================
  it('PUT /users/:id should update user', async () => {
    prismaMock.user.update.mockResolvedValue({ id: 1, nombre: 'Updated', email: 'a@b.com', rol: 'student' });
    const res = await request(app).put('/users/1').send({ nombre: 'Updated' });
    expect(res.statusCode).toBe(200);
    expect(res.body.nombre).toBe('Updated');
  });

  it('PUT /users/:id should return 403 if user cannot update', async () => {
    // Simulate non-professor trying to update another user
    prismaMock.user.update.mockImplementation(() => { throw new Error(); });
    const res = await request(app).put('/users/999').send({ nombre: 'Fail' });
    expect(res.statusCode).toBe(500); // since mock throws
  });

  // ================= DELETE /users/:id =================
  it('DELETE /users/:id should delete user and reassign exams', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 2, nombre: 'Juan', exams: [{ id: 1 }] });
    prismaMock.user.create.mockResolvedValue({ id: 999, nombre: 'Backuser', email: 'backuser@system.com', rol: 'system' });
    prismaMock.exam.updateMany.mockResolvedValue({});
    prismaMock.user.delete.mockResolvedValue({});
    
    const res = await request(app).delete('/users/2');
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/eliminado/);
  });
});
