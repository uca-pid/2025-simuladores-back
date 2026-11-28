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
    updateMany: jest.fn(),
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
        examWindow: { examId: 1, activa: true, estado: "programada", sinTiempo: true },
      });
      prismaMock.examAttempt.findFirst.mockResolvedValue(null);
      prismaMock.exam.findUnique.mockResolvedValue({ id: 1, ordenAleatorio: false, partes: [] });
      prismaMock.examAttempt.create.mockResolvedValue({ id: 1, userId: 1, examId: 1, estado: "en_progreso" });

      const res = await request(app)
        .post("/exam-attempts/start")
        .send({ examId: 1, examWindowId: 1 });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("id", 1);
    });

    it("should return existing attempt if already exists", async () => {
      prismaMock.inscription.findUnique.mockResolvedValue({
        examWindow: { examId: 1, activa: true, estado: "programada", sinTiempo: true },
      });
      prismaMock.examAttempt.findFirst.mockResolvedValue({ id: 42 });

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

    it("should return 400 and not create an attempt without examWindowId", async () => {
      const res = await request(app)
        .post("/exam-attempts/start")
        .send({ examId: 1 });

      expect(res.statusCode).toBe(400);
      expect(prismaMock.examAttempt.create).not.toHaveBeenCalled();
    });

    it("should return 403 if the window belongs to another exam", async () => {
      prismaMock.inscription.findUnique.mockResolvedValue({
        examWindow: { examId: 2, activa: true, estado: "programada", sinTiempo: true },
      });

      const res = await request(app)
        .post("/exam-attempts/start")
        .send({ examId: 1, examWindowId: 1 });

      expect(res.statusCode).toBe(403);
      expect(prismaMock.examAttempt.create).not.toHaveBeenCalled();
    });
  });

  describe("PUT /exam-attempts/:attemptId/save-code", () => {
    it("should save code for programming exam", async () => {
      prismaMock.examAttempt.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        estado: "en_progreso",
        exam: { partes: [{ tipo: "programming" }] },
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

  describe("GET /exam-attempts/:attemptId/status (ventana vencida)", () => {
    const intentoEnCurso = (examWindow) => ({
      id: 5, userId: 1, examId: 1, estado: "en_progreso", partStatus: "en_curso",
      currentPartIndex: 0, puntaje: null, examWindow,
      exam: { partes: [], _count: { partes: 1 } },
    });

    it("finaliza el intento si la ventana ya fue finalizada", async () => {
      const ventana = { id: 7, estado: "finalizada", activa: true, sinTiempo: true };
      prismaMock.examAttempt.findUnique
        .mockResolvedValueOnce(intentoEnCurso(ventana)) // getAttemptStatus
        .mockResolvedValueOnce(intentoEnCurso(ventana)) // finalizarSiVencido
        .mockResolvedValueOnce(intentoEnCurso(ventana)) // forceFinishAttempt
        .mockResolvedValueOnce({ ...intentoEnCurso(ventana), estado: "finalizado" }); // relectura
      prismaMock.examAttempt.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(app).get("/exam-attempts/5/status");

      expect(res.statusCode).toBe(200);
      expect(res.body.estado).toBe("finalizado");
      expect(prismaMock.examAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5, estado: "en_progreso" } })
      );
    });

    it("no toca el intento si la ventana sigue abierta", async () => {
      const ventana = { id: 7, estado: "en_curso", activa: true, sinTiempo: true };
      prismaMock.examAttempt.findUnique.mockResolvedValue(intentoEnCurso(ventana));

      const res = await request(app).get("/exam-attempts/5/status");

      expect(res.statusCode).toBe(200);
      expect(res.body.estado).toBe("en_progreso");
      expect(prismaMock.examAttempt.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe("updateWindowStatuses", () => {
  it("al vencer la ventana finaliza los intentos que quedaron en curso", async () => {
    const { updateWindowStatuses } = await import("../src/services/examWindow.service.ts");
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    const prisma = {
      examWindow: {
        findMany: jest.fn().mockResolvedValue([{
          id: 7, estado: "en_curso", sinTiempo: false, fechaInicio: haceUnaHora, duracion: 30,
          exam: { id: 1, titulo: "Parcial", profesorId: 2 }, extensionesTiempo: [],
        }]),
        update: jest.fn().mockResolvedValue({}),
      },
      examAttempt: {
        findMany: jest.fn().mockResolvedValue([{ id: 5 }]),
        findUnique: jest.fn().mockResolvedValue({
          id: 5, userId: 1, examId: 1, estado: "en_progreso", partStatus: "en_curso",
          currentPartIndex: 0, puntaje: null, exam: { partes: [] },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await updateWindowStatuses(prisma);
    // La finalización corre en segundo plano: esperar a que termine
    for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));

    expect(prisma.examWindow.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { estado: "finalizada" } });
    expect(prisma.examAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { examWindowId: 7, estado: "en_progreso" } })
    );
    expect(prisma.examAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, estado: "en_progreso" }, data: expect.objectContaining({ estado: "finalizado" }) })
    );
  });
});
