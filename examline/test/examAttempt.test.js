// test/examAttempt.test.js
import request from "supertest";
import express from "express";
import ExamAttemptRoute from "../src/routes/examAttempt.route";

// Mock PrismaClient
const prismaMock = {
  inscription: {
    findUnique: jest.fn(),
  },
  examAttempt: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  exam: {
    findUnique: jest.fn(),
  },
  examFile: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

// Mock middlewares
jest.mock("../src/middleware/auth.ts", () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1 };
    next();
  },
  requireRole: () => (req, res, next) => next(),
}));

// Mock CodeExecutionService
jest.mock("../src/services/codeExecution.service.ts", () => {
  return jest.fn().mockImplementation(() => ({
    executeCode: jest.fn().mockResolvedValue({ output: "", exitCode: 0 }),
  }));
});

const app = express();
app.use(express.json());
app.use("/exam-attempts", ExamAttemptRoute(prismaMock));

describe("ExamAttemptRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /exam-attempts/start", () => {
    it("should create a new attempt if none exists", async () => {
      prismaMock.inscription.findUnique.mockResolvedValue({
        examWindow: { activa: true, estado: "programada", sinTiempo: true },
      });
      prismaMock.examAttempt.findUnique.mockResolvedValue(null);
      prismaMock.examAttempt.create.mockResolvedValue({ id: 1, userId: 1, examId: 1, estado: "en_progreso" });

      const res = await request(app)
        .post("/exam-attempts/start")
        .send({ examId: 1, examWindowId: 1 });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("id", 1);
    });

    it("should return existing attempt if already exists", async () => {
      prismaMock.inscription.findUnique.mockResolvedValue({
        examWindow: { activa: true, estado: "programada", sinTiempo: true },
      });
      prismaMock.examAttempt.findUnique.mockResolvedValue({ id: 42 });

      const res = await request(app)
        .post("/exam-attempts/start")
        .send({ examId: 1, examWindowId: 1 });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("id", 42);
    });

    it("should return 403 if not enrolled", async () => {
      prismaMock.inscription.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/exam-attempts/start")
        .send({ examId: 1, examWindowId: 1 });

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("PUT /exam-attempts/:attemptId/save-code", () => {
    it("should save code for programming exam", async () => {
      prismaMock.examAttempt.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        estado: "en_progreso",
        exam: { tipo: "programming" },
      });
      prismaMock.examAttempt.update.mockResolvedValue({ id: 1, codigoProgramacion: "print('ok')" });

      const res = await request(app)
        .put("/exam-attempts/1/save-code")
        .send({ codigoProgramacion: "print('ok')" });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("message", "Código guardado exitosamente");
    });

    it("should return 404 if attempt not found", async () => {
      prismaMock.examAttempt.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put("/exam-attempts/999/save-code")
        .send({ codigoProgramacion: "print('ok')" });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /exam-attempts/check/:examId", () => {
    it("should return hasAttempt true if attempt exists", async () => {
      prismaMock.examAttempt.findFirst.mockResolvedValue({ id: 1 });

      const res = await request(app).get("/exam-attempts/check/1");

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("hasAttempt", true);
    });

    it("should return hasAttempt false if no attempt", async () => {
      prismaMock.examAttempt.findFirst.mockResolvedValue(null);

      const res = await request(app).get("/exam-attempts/check/1");

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("hasAttempt", false);
    });
  });
});
