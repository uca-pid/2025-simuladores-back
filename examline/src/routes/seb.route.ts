import { Router, type Request, type Response } from "express"
import { type PrismaClient } from "@prisma/client"
import 'dotenv/config';
import fs from "fs"
import path from "path"
import {
  getExamWindowSEBSettings,
  buildSEBXml,
  type SEBConfigParams,
  type ExamWindowSEBSettings
} from "../services/sebConfig.service"

const ExamStartRoute = (prisma: PrismaClient) => {
  const router = Router()
  const FRONTEND_URL1 = process.env.FRONTEND_URL || "http://localhost:3000"
  const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`

  // Ruta para descargar el .seb dinámico
  router.get("/download/:examId/:windowId/:token", async (req: Request, res: Response) => {
    const { examId, windowId, token } = req.params
    const contra = "12345" // contraseña para quit/admin

    // Validar que el examen exista en la base de datos
    const exam = await prisma.exam.findUnique({
      where: { id: Number(examId) }
    })

    if (!exam) return res.status(404).json({ error: "Examen no encontrado" })
    const examWindow = await prisma.examWindow.findUnique({
      where: { id: Number(windowId) }
    })

    if (!examWindow) return res.status(404).json({ error: "Ventana de examen no encontrada" })

    // Obtener configuración de SEB desde la base de datos
    const sebSettings = await getExamWindowSEBSettings(prisma, Number(windowId))
    
    if (!sebSettings) {
      return res.status(500).json({ error: "Error al obtener configuración de SEB" })
    }

    const frontUrl = `${FRONTEND_URL1}/exam-attempt/${examId}?windowId=${windowId}&token=${token}`;

    // Construir parámetros para el builder
    const params: SEBConfigParams = {
      examId: Number(examId),
      windowId: Number(windowId),
      token,
      frontUrl,
      backendUrl: BACKEND_URL,
      quitPassword: contra,
      settingsPassword: contra,
    }

    // Construir el XML usando la configuración de la base de datos
    const sebPlist = buildSEBXml(params, sebSettings)

    // Carpeta donde se guardarán los .seb
  const examsFolder = path.join(process.cwd(), "examenes");
  if (!fs.existsSync(examsFolder)) fs.mkdirSync(examsFolder);
   const fileName = `examen_${examId}.seb`;
    const filePath = path.join(examsFolder, fileName);

    // Guardar el .seb en la carpeta
    fs.writeFileSync(filePath, sebPlist, "utf8");

    // Devolver la URL para que el frontend la abra
    // Construir la URL usando la configuración del backend hosteado
    const backendHost = BACKEND_URL.replace('http://', '').replace('https://', '');
    const sebUrl = `seb://${backendHost}/examenes/${fileName}`;
    res.json({ sebUrl });
    
  })

  return router
}

export default ExamStartRoute
