
const request = require('supertest');
const express = require('express');
const addRoutes = require('../src/routes').default;
const cors = require('cors');

// Mock PrismaClient solo para este test
const prismaMock = {
  user: {
    findMany: jest.fn().mockResolvedValue([
      { id: 1, nombre: 'Test', email: 'test@email.com' }
    ])
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
