
const request = require('supertest');
const express = require('express');
const addRoutes = require('../src/routes').default;
const cors = require('cors');

// Mock PrismaClient solo para este test
const prismaMock = {
  user: {
    findMany: jest.fn().mockResolvedValue([
      { id: 1, nombre: 'Test', email: 'test@email.com', rol: 'student' }
    ]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => {
      return {
        id: 2,
        nombre: data.nombre,
        email: data.email,
        rol: data.rol || 'student',
        password: data.password
      };
    })
  },
  exam: {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      // si viene un id específico para test
      if (where.id === 1) {
        return Promise.resolve({
          id: 1,
          titulo: 'Examen de prueba',
          profesorId: 1,
          preguntas: [
            { id: 1, texto: 'Pregunta 1', opciones: ['a', 'b', 'c'], correcta: 0, examId: 1 },
            { id: 2, texto: 'Pregunta 2', opciones: ['x', 'y', 'z'], correcta: 1, examId: 1 }
          ]
        });
      }
      return Promise.resolve(null); // examen no encontrado
    }),
    create: jest.fn().mockImplementation(({ data }) => ({
      id: 3,
      titulo: data.titulo,
      profesorId: data.profesorId,
      preguntas: data.preguntas || []
    }))
  },
  pregunta: {
    create: jest.fn().mockImplementation(({ data }) => ({
      id: Math.floor(Math.random() * 1000),
      texto: data.texto,
      opciones: data.opciones,
      correcta: data.correcta,
      examId: data.examId
    }))
  }
};

const app = express();
app.use(cors());
app.use(express.json());
addRoutes(app, prismaMock);

describe('GET /users', () => {
  it('debe responder con lista de usuarios', async () => {
    const res = await request(app).get('/users');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('nombre', 'Test');
  });
});
describe('GET /exams/:examId', () => {
  it('debe responder con el examen si existe', async () => {
    // Mock de un examen con preguntas
    prismaMock.exam.findUnique.mockResolvedValue({
      id: 1,
      nombre: 'Examen de prueba',
      preguntas: [
        { id: 1, texto: 'Pregunta 1' },
        { id: 2, texto: 'Pregunta 2' }
      ]
    });

    const res = await request(app).get('/exams/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
    expect(res.body).toHaveProperty('preguntas');
    expect(res.body.preguntas.length).toBe(2);
  })

  it('debe responder 404 si el examen no existe', async () => {
    prismaMock.exam.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/exams/999');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error', 'Examen no encontrado');
  });

  it('debe responder 400 si examId no es un número', async () => {
    const res = await request(app).get('/exams/abc');
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'examId inválido');
  });

});
