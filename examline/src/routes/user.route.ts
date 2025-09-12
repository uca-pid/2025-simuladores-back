import { type PrismaClient } from "@prisma/client";
import { Router } from "express";
import bcrypt from "bcryptjs";  // Importar bcrypt

const UserRoute = (prisma: PrismaClient) => {
  const router = Router();

  // Obtener todos los usuarios
  router.get('/', async (req, res) => {
    try {
      const users = await prisma.user.findMany();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener los usuarios.' });
    }
  });

  router.post("/signup", async (req, res) => {
  const { nombre, email, password } = req.body;

  try {
    // Verificar si el email ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: "El email ya está registrado." });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await prisma.user.create({
      data: {
        nombre,
        email,
        password: hashedPassword,
      },
      select: { id: true, nombre: true, email: true }, // no devolvemos la contraseña
    });

    res.status(201).json(user);
  } catch (error) {
    console.error("Error al crear el usuario:", error);
    res.status(500).json({ error: "Error al crear el usuario." });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Buscar al usuario por el email en la base de datos
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log('Email no encontrado');
      return res.status(404).json({ error: 'El email no está registrado.' });
    }

    // Comparar la contraseña proporcionada con la almacenada (encriptada)
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      console.log('Contraseña incorrecta');
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    // Si las credenciales son correctas → devolver datos básicos del usuario
    console.log('Login exitoso');
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

  return router;
};

export default UserRoute;