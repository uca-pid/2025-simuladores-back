import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import bcrypt from "bcryptjs";  // Importar bcrypt

const UserRoute = (prisma: PrismaClient) => {
  const router = Router();

  // Obtener todos los usuarios
  router.get('/', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, nombre: true, email: true }, // no enviamos password
      });
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener los usuarios.' });
    }
  });

  // 🔹 Obtener un usuario por id
  router.get('/:id', async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: parseInt(req.params.id) },
        select: { id: true, nombre: true, email: true }, // sin password
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener el usuario.' });
    }
  });

  // 🔹 Registrar usuario
  router.post("/signup", async (req, res) => {
    const { nombre, email, password } = req.body;

    try {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "El email ya está registrado." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          nombre,
          email,
          password: hashedPassword,
        },
        select: { id: true, nombre: true, email: true },
      });

      res.status(201).json(user);
    } catch (error) {
      console.error("Error al crear el usuario:", error);
      res.status(500).json({ error: "Error al crear el usuario." });
    }
  });

  // 🔹 Login
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(404).json({ error: 'El email no está registrado.' });
      }

      const isPasswordCorrect = await bcrypt.compare(password, user.password);

      if (!isPasswordCorrect) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
      }

      return res.json({
        message: 'Login exitoso',
        userId: user.id,
        nombre: user.nombre,
        email: user.email,
      });
    } catch (error) {
      console.error('Error al verificar el usuario:', error);
      return res.status(500).json({ error: 'Hubo un problema al verificar las credenciales' });
    }
  });

  // 🔹 Actualizar usuario
  router.put('/:id', async (req, res) => {
    const { nombre, email, password } = req.body;

    try {
      // preparar objeto de actualización
      const dataToUpdate: any = {};
      if (nombre) dataToUpdate.nombre = nombre;
      if (email) dataToUpdate.email = email;
      if (password && password.trim() !== "") {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id: parseInt(req.params.id) },
        data: dataToUpdate,
        select: { id: true, nombre: true, email: true }, // no devolvemos password
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      res.status(500).json({ error: 'Error al actualizar el usuario.' });
    }
  });

  return router;
};

export default UserRoute;
