const request = require("supertest");
const express = require("express");
const addRoutes = require("../src/routes").default;
const cors = require("cors");

// Mock PrismaClient solo para este test
const prismaMock = {
  user: {
    findMany: jest.fn().mockResolvedValue([
      { id: 1, nombre: "Test", email: "test@email.com", rol: "student" } // agregamos rol aquí también
    ]),
    findUnique: jest.fn().mockResolvedValue(null), // simula que no existe todavía
    create: jest.fn().mockImplementation(({ data }) => {
      return { 
        id: 2, 
        nombre: data.nombre, 
        email: data.email, 
        rol: data.rol || "student"  // <--- default aplicado
      };
    })
  }
};

const app = express();
app.use(cors());
app.use(express.json());
addRoutes(app, prismaMock);

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
