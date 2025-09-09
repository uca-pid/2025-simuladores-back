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

  // Crear un nuevo usuario (con encriptación de la contraseña)
  router.post('/signup', async (req, res) => {
    const { nombre, email} = req.body;
  
    try {
      // Verificar si el email ya existe
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
  
      if (existingUser) {
        return res.status(400).json({ error: 'El email ya está registrado.' });
      }
  
      // Crear el usuario con la contraseña encriptada
      const result = await prisma.user.create({
        data: {
          name: nombre,
          email: email,
        },
      });
  
      res.status(201).json(result);
    } catch (error) {
      console.error('Error al crear el usuario:', error);
      res.status(500).json({ error: 'Error al crear el usuario.' });
    }
  });

  return router;
};

export default UserRoute;