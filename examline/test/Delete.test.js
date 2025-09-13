const request = require("supertest");
const express = require("express");
const addRoutes = require("../src/routes").default;
const cors = require("cors");
const bcrypt = require("bcryptjs");

// Mock PrismaClient solo para este test
const prismaMock = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn()
  },
  exam: {
    updateMany: jest.fn()
  }
};

const app = express();
app.use(cors());
app.use(express.json());
addRoutes(app, prismaMock);

describe("DELETE /users/special/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("debe reasignar los exámenes al Backuser y eliminar el usuario", async () => {
    // Simular usuario a eliminar
    const usuarioAEliminar = {
      id: 10,
      nombre: "Profesor Prueba",
      email: "profesor@test.com",
      rol: "teacher",
      exams: [{ id: 100, titulo: "Examen Prueba", profesorId: 10 }]
    };

    // Simular que existe Backuser
    const backuser = {
      id: 99,
      nombre: "Backuser",
      email: "backuser@system.com",
      rol: "system",
      password: await bcrypt.hash("backuser123", 10)
    };

    // Mocks
    prismaMock.user.findUnique
      .mockResolvedValueOnce(usuarioAEliminar) // primer findUnique: buscar usuario a eliminar
      .mockResolvedValueOnce(backuser);        // segundo findUnique: buscar Backuser

    prismaMock.exam.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.delete.mockResolvedValue(usuarioAEliminar);

    const res = await request(app).delete("/users/special/10");

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(
      `Usuario ${usuarioAEliminar.nombre} eliminado. Sus exámenes fueron asignados al Backuser.`
    );

    // Verificar que se reasignaron exámenes
    expect(prismaMock.exam.updateMany).toHaveBeenCalledWith({
      where: { profesorId: usuarioAEliminar.id },
      data: { profesorId: backuser.id },
    });

    // Verificar que se eliminó el usuario
    expect(prismaMock.user.delete).toHaveBeenCalledWith({
      where: { id: usuarioAEliminar.id },
    });
  });

  it("debe responder 404 si el usuario no existe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app).delete("/users/special/123");

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("error", "Usuario no encontrado.");
  });
});