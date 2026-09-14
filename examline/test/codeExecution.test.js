// test/codeExecution.test.js
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import CodeExecutionRoute from '../src/routes/codeExecution.route.ts';

// Mock PrismaClient
const prismaMock = {
  exam: {
    findUnique: jest.fn(),
  },
  inscription: {
    findFirst: jest.fn(),
  },
};

// Mock authentication middleware
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, rol: 'professor', nombre: 'Test', email: 'test@test.com' };
    next();
  },
  requireRole: (roles) => (req, res, next) => next(),
}));

// Mock CodeExecutionService
const mockExecute = jest.fn();
const mockValidate = jest.fn();

jest.mock('../src/services/codeExecution.service.ts', () => {
  return jest.fn().mockImplementation(() => ({
    executeCode: mockExecute,
    validateSyntax: mockValidate,
  }));
});

const app = express();
app.use(cors());
app.use(express.json());
app.use('/code-execution', CodeExecutionRoute(prismaMock));

describe('CodeExecutionRoute tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================= POST /run =================
  it('POST /run should return 400 if missing code or language', async () => {
    const res = await request(app).post('/code-execution/run').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/requeridos/);
  });

  it('POST /run should execute code successfully', async () => {
    mockExecute.mockResolvedValue({
      output: 'Hello World',
      error: null,
      exitCode: 0,
      executionTime: 10,
    });

    const res = await request(app)
      .post('/code-execution/run')
      .send({ code: 'print("Hello")', language: 'python' });

    expect(res.statusCode).toBe(200);
    expect(res.body.output).toBe('Hello World');
    expect(mockExecute).toHaveBeenCalled();
  });

  // ================= POST /validate =================
  it('POST /validate should return validation result', async () => {
    mockValidate.mockResolvedValue({ valid: true, errors: [] });

    const res = await request(app)
      .post('/code-execution/validate')
      .send({ code: 'print("Hello")', language: 'python' });

    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(mockValidate).toHaveBeenCalled();
  });

  // ================= POST /execute =================
  it('POST /execute should run code with custom input for professor', async () => {
    mockExecute.mockResolvedValue({
      output: 'Result',
      error: null,
      exitCode: 0,
      executionTime: 5,
    });

    const res = await request(app)
      .post('/code-execution/execute')
      .send({ code: 'print(input())', language: 'python', customInput: 'test' });

    expect(res.statusCode).toBe(200);
    expect(res.body.output).toBe('Result');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('POST /execute should run code with test cases', async () => {
    mockExecute.mockResolvedValueOnce({ output: '2', error: null, exitCode: 0, executionTime: 2 })
               .mockResolvedValueOnce({ output: '3', error: null, exitCode: 0, executionTime: 2 });

    const testCases = [
      { input: '1+1', expectedOutput: '2' },
      { input: '1+2', expectedOutput: '3' },
    ];

    const res = await request(app)
      .post('/code-execution/execute')
      .send({ code: 'print(eval(input()))', language: 'python', testCases });

    expect(res.statusCode).toBe(200);
    expect(res.body.score).toBe(100);
    expect(res.body.passedTests).toBe(2);
    expect(res.body.totalTests).toBe(2);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('POST /execute should fail for unsupported language', async () => {
    const res = await request(app)
      .post('/code-execution/execute')
      .send({ code: 'code', language: 'ruby' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no soportado/);
  });
});
