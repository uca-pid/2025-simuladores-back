const request = require("supertest");
const express = require("express");
const addRoutes = require("../src/routes").default;
const cors = require("cors");

// Mock PrismaClient para este test
const prismaMock = {
  user: {
    findMany: jest.fn().mockResolvedValue([
      { id: 1, nombre: "Test", email: "test@email.com", rol: "student" }
    ]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => {
      return { 
        id: 2, 
        nombre: data.nombre, 
        email: data.email, 
        rol: data.rol || "student"
      };
    })
  },
  exam: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn()
  }
};

const app = express();
app.use(cors());
app.use(express.json());
addRoutes(app, prismaMock);

//
// TESTS USERS
//
describe("POST /users/signup", () => {
  it("debe crear un estudiante y responder con el estudiante creado", async () => {
    const nuevoEstudiante = {
      nombre: "Juan",
      email: "juan@email.com",
      password: "1231"
    };

    const res = await request(app)
      .post("/users/signup")
      .send(nuevoEstudiante);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("nombre", "Juan");
    expect(res.body).toHaveProperty("email", "juan@email.com");
    expect(res.body).toHaveProperty("rol", "student");
  });
});

//
// TESTS EXAMS
//
describe("POST /exams/create", () => {
  it("debería crear un examen con preguntas", async () => {
    const nuevoExamen = {
      titulo: "Examen de Matemáticas",
      profesorId: 1,
      preguntas: [
        { texto: "2+2", correcta: "4", opciones: ["3", "4", "5"] }
      ]
    };

    prismaMock.exam.create.mockResolvedValue({
      id: 1,
      titulo: nuevoExamen.titulo,
      profesorId: 1,
      preguntas: nuevoExamen.preguntas
    });

    const res = await request(app).post("/exams/create").send(nuevoExamen);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("titulo", "Examen de Matemáticas");
    expect(res.body.preguntas).toHaveLength(1);
  });

  it("debería responder 500 si falla la creación", async () => {
    prismaMock.exam.create.mockRejectedValue(new Error("DB error"));

    const res = await request(app).post("/exams/create").send({
      titulo: "Examen roto",
      profesorId: 1,
      preguntas: []
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty("error", "No se pudo crear el examen");
  });
});

describe("GET /exams", () => {
  it("debería devolver exámenes de un profesor", async () => {
    prismaMock.exam.findMany.mockResolvedValue([
      { id: 1, titulo: "Examen 1", profesorId: 1, preguntas: [] }
    ]);

    const res = await request(app).get("/exams?profesorId=1");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty("titulo", "Examen 1");
  });

  it("debería devolver 400 si el profesorId es inválido", async () => {
    const res = await request(app).get("/exams?profesorId=abc");

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error", "ProfesorId inválido");
  });
});

describe("GET /exams/:examId", () => {
  it("debería devolver un examen por id", async () => {
    prismaMock.exam.findUnique.mockResolvedValue({
      id: 1,
      titulo: "Examen único",
      profesorId: 1,
      preguntas: []
    });

    const res = await request(app).get("/exams/1");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("titulo", "Examen único");
  });

  it("debería devolver 400 si examId es inválido", async () => {
    const res = await request(app).get("/exams/abc");

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error", "examId inválido");
  });

  it("debería devolver 404 si el examen no existe", async () => {
    prismaMock.exam.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/exams/99");

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("error", "Examen no encontrado");
  });
});
