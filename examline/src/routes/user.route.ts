import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { generateToken, refreshToken } from "../utils/jwt.ts";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const UserRoute = (prisma: PrismaClient) => {
  const router = Router();

  // Obtener todos los usuarios (protected - professors only)
  router.get('/', authenticateToken, requireRole(['professor', 'system']), async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, nombre: true, email: true, rol: true },
      });
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener los usuarios.' });
    }
  });

  // Obtener un usuario por id (protected)
  router.get('/:id', authenticateToken, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: parseInt(req.params.id) },
        select: { id: true, nombre: true, email: true, rol: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener el usuario.' });
    }
  });

  // Registrar usuario
  router.post("/signup", async (req, res) => {
    const { nombre, email, password, rol } = req.body;

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
          rol: rol || "student", // 👈 por defecto student
        },
        select: { id: true, nombre: true, email: true, rol: true },
      });

      res.status(201).json(user);
    } catch (error) {
      console.error("Error al crear el usuario:", error);
      res.status(500).json({ error: "Error al crear el usuario." });
    }
  });

  // Login
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

      // Generate JWT token
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      };

      const token = generateToken(tokenPayload);

      return res.json({
        message: 'Login exitoso',
        token, // JWT token
        user: {
          userId: user.id,
          nombre: user.nombre,
          email: user.email,
          rol: user.rol,
        },
      });
    } catch (error) {
      console.error('Error al verificar el usuario:', error);
      return res.status(500).json({ error: 'Hubo un problema al verificar las credenciales' });
    }
  });

  // Token refresh endpoint
  router.post('/refresh-token', authenticateToken, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Usuario no autenticado' });
      }

      // Generate a new token with the same user data
      const newToken = refreshToken(req.user);

      res.json({
        message: 'Token renovado exitosamente',
        token: newToken,
        user: req.user,
      });
    } catch (error) {
      console.error('Error al renovar token:', error);
      res.status(500).json({ error: 'Error al renovar el token' });
    }
  });

  // Get current user info (protected route)
  router.get('/me', authenticateToken, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Usuario no autenticado' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, nombre: true, email: true, rol: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json(user);
    } catch (error) {
      console.error('Error al obtener información del usuario:', error);
      res.status(500).json({ error: 'Error al obtener información del usuario' });
    }
  });

  // Actualizar usuario (protected - users can only update themselves, professors can update anyone)
  router.put('/:id', authenticateToken, async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    const targetUserId = parseInt(req.params.id);

    try {
      // Users can only update themselves, unless they're professors
      if (req.user!.rol !== 'professor' && req.user!.userId !== targetUserId) {
        return res.status(403).json({ error: 'No tienes permisos para actualizar este usuario' });
      }
      const dataToUpdate: any = {};
      if (nombre) dataToUpdate.nombre = nombre;
      if (email) dataToUpdate.email = email;
      if (rol) dataToUpdate.rol = rol;
      if (password && password.trim() !== "") {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id: targetUserId },
        data: dataToUpdate,
        select: { id: true, nombre: true, email: true, rol: true },
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      res.status(500).json({ error: 'El email ya esta registrado.' });
    }
  });

  // Eliminar usuario
  /*router.delete('/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      await prisma.user.delete({ where: { id } });

      res.json({ message: 'Usuario eliminado correctamente.' });
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      res.status(500).json({ error: 'Error al eliminar el usuario.' });
    }
  });*/
  // Eliminar usuario pero reasignando sus exámenes al "Backuser"
router.delete('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Verificar si el usuario existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { exams: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    // Buscar o crear el usuario especial "Backuser"
    let backuser = await prisma.user.findUnique({
      where: { email: "backuser@system.com" }, // 👈 le damos un email fijo
    });

    if (!backuser) {
      backuser = await prisma.user.create({
        data: {
          nombre: "Backuser",
          email: "backuser@system.com",
          password: await bcrypt.hash("backuser1235123123123123123123ferroAguanteganalalibertadores1231231231231241351231351Q@25242345676789765434234e56678978654323w4e567", 10), // 👈 contraseña dummy
          rol: "system",
        },
      });
    }

    // Reasignar todos los exámenes al Backuser
    await prisma.exam.updateMany({
      where: { profesorId: userId },
      data: { profesorId: backuser.id },
    });

    // Eliminar al usuario original
    await prisma.user.delete({ where: { id: userId } });

    res.json({
      message: `Usuario ${user.nombre} eliminado. Sus exámenes fueron asignados al Backuser.`,
    });
  } catch (error) {
    console.error("Error en special delete:", error);
    res.status(500).json({ error: "Error en el proceso de eliminación especial." });
  }
});

  return router;
};



export default UserRoute;
