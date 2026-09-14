// test/examFiles.test.js
import request from "supertest";
import express from "express";
import ExamFilesRoute from "../src/routes/examFiles.route";

// Mock PrismaClient
const prismaMock = {
  inscription: { findFirst: jest.fn() },
  examFile: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
  exam: { findUnique: jest.fn() },
};

// Mock authenticateToken
jest.mock("../src/middleware/auth", () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, rol: "student" }; // Cambiar a "professor" para tests de profesor
    next();
  }
}));

const app = express();
app.use(express.json());
app.use("/exam-files", ExamFilesRoute(prismaMock));

describe("ExamFilesRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /:examId/files", () => {
    it("should return files for a student", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, examWindow: { activa: true } });
      prismaMock.examFile.findMany.mockResolvedValue([{ id: 1, filename: "main.py", version: "manual" }]);

      const res = await request(app).get("/exam-files/1/files");

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty("filename", "main.py");
    });

    it("should return 403 if student not enrolled", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue(null);

      const res = await request(app).get("/exam-files/1/files");

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("GET /:examId/files/:filename", () => {
    it("should return a specific file", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, examWindow: { activa: true } });
      prismaMock.examFile.findFirst.mockResolvedValue({ id: 1, filename: "main.py" });

      const res = await request(app).get("/exam-files/1/files/main.py");

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("filename", "main.py");
    });

    it("should return 404 if file not found", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, examWindow: { activa: true } });
      prismaMock.examFile.findFirst.mockResolvedValue(null);

      const res = await request(app).get("/exam-files/1/files/missing.py");

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /:examId/files", () => {
    it("should create or update a file", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, examWindow: { activa: true } });
      prismaMock.examFile.upsert.mockResolvedValue({ id: 1, filename: "main.py", content: "print('ok')" });

      const res = await request(app)
        .post("/exam-files/1/files")
        .send({ filename: "main.py", content: "print('ok')" });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("filename", "main.py");
    });

    it("should return 400 if filename missing", async () => {
      const res = await request(app)
        .post("/exam-files/1/files")
        .send({ content: "print('ok')" });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /:examId/files/:filename", () => {
    it("should delete a file", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, examWindow: { activa: true } });
      prismaMock.examFile.findFirst.mockResolvedValue({ id: 1, filename: "main.py" });
      prismaMock.examFile.delete.mockResolvedValue({});

      const res = await request(app).delete("/exam-files/1/files/main.py");

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("message");
    });

    it("should return 404 if file not found", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, examWindow: { activa: true } });
      prismaMock.examFile.findFirst.mockResolvedValue(null);

      const res = await request(app).delete("/exam-files/1/files/missing.py");

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /:examId/files/submission", () => {
    it("should save multiple submission files", async () => {
      prismaMock.inscription.findFirst.mockResolvedValue({ id: 1, examWindow: { activa: true } });
      prismaMock.examFile.findFirst.mockResolvedValue(null);
      prismaMock.examFile.create.mockResolvedValue({ id: 1, filename: "main.py" });

      const res = await request(app)
        .post("/exam-files/1/files/submission")
        .send({ files: [{ filename: "main.py", content: "print('ok')" }] });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("files");
      expect(res.body.files[0]).toHaveProperty("filename", "main.py");
    });

    it("should return 400 if files array missing", async () => {
      const res = await request(app).post("/exam-files/1/files/submission").send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe("Professor reference solution endpoints", () => {
    beforeEach(() => {
      // Cambiar usuario a profesor
      prismaMock.exam.findUnique.mockResolvedValue({ id: 1, profesorId: 1, tipo: "programming" });
    });

    it("GET /:examId/reference-solution should return reference files", async () => {
      prismaMock.examFile.findMany.mockResolvedValue([{ id: 1, filename: "main.py" }]);

      const res = await request(app).get("/exam-files/1/reference-solution");

      expect(res.statusCode).toBe(200);
      expect(res.body[0]).toHaveProperty("filename", "main.py");
    });

    it("POST /:examId/reference-solution should save reference files", async () => {
      prismaMock.examFile.upsert.mockResolvedValue({ id: 1, filename: "main.py" });

      const res = await request(app)
        .post("/exam-files/1/reference-solution")
        .send({ files: [{ filename: "main.py", content: "print('ok')" }] });

      expect(res.statusCode).toBe(200);
      expect(res.body.files[0]).toHaveProperty("filename", "main.py");
    });

    it("DELETE /:examId/reference-solution/:filename should delete reference file", async () => {
      prismaMock.examFile.findFirst.mockResolvedValue({ id: 1, filename: "main.py" });
      prismaMock.examFile.delete.mockResolvedValue({});

      const res = await request(app).delete("/exam-files/1/reference-solution/main.py");

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("message");
    });
  });
});
