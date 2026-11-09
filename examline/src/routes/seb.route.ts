import { Router, type Request, type Response } from "express"
import { type PrismaClient } from "@prisma/client"
import 'dotenv/config';
import fs from "fs"
import path from "path"
import crypto from "crypto"
import {
  getExamWindowSEBSettings,
  buildSEBXml,
  sebSettingsDesde,
  type SEBConfigParams,
  type ExamWindowSEBSettings
} from "../services/sebConfig.service"
import { authenticateToken, requireOwnership, requireRole } from "../middleware/auth"
import { generateSEBPreviewToken, verifySEBPreviewToken } from "../utils/jwt"
import { getExamForSEBPreview } from "../services/exam.service"

// Los .seb de prueba quedan públicos en /examenes con un token de vista previa
// adentro: se borran pasada una hora para que no se acumulen.
const VIDA_ARCHIVO_PRUEBA_MS = 60 * 60 * 1000

function borrarPruebasViejas(carpeta: string) {
  for (const archivo of fs.readdirSync(carpeta)) {
    if (!archivo.startsWith("prueba_") || !archivo.endsWith(".seb")) continue
    const ruta = path.join(carpeta, archivo)
    if (Date.now() - fs.statSync(ruta).mtimeMs > VIDA_ARCHIVO_PRUEBA_MS) {
      fs.unlinkSync(ruta)
    }
  }
}

const ExamStartRoute = (prisma: PrismaClient) => {
  const router = Router()
  const FRONTEND_URL1 = process.env.FRONTEND_URL || "http://localhost:3000"
  const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`

  // Ruta para descargar el .seb dinámico
  router.get("/download/:examId/:windowId/:token", async (req: Request, res: Response) => {
    const { examId, windowId, token } = req.params

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
      // Sin contraseñas acá: buildSEBXml usa las configuradas en la ventana
      // (sebQuitPassword / sebSettingsPassword, por defecto "12345").
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

  // POST /exam-start/test-download - .seb de prueba con la configuración del formulario
  // (aunque no esté guardada) que abre el examen en vista previa dentro de SEB
  router.post("/test-download", authenticateToken, requireRole(['professor']), requireOwnership(prisma, 'exam'), async (req: Request, res: Response) => {
    const examId = Number(req.body.examId)
    const sebSettings = sebSettingsDesde(req.body)

    // El token va en el fragmento (#): el navegador no lo manda al servidor del front
    const previewToken = generateSEBPreviewToken(req.user!.userId, examId)
    const fragmento = new URLSearchParams({ previewToken, quitUrl: sebSettings.quitUrl }).toString()
    const frontUrl = `${FRONTEND_URL1}/exam-preview/${examId}#${fragmento}`

    const params: SEBConfigParams = {
      examId,
      windowId: 0,
      token: "",
      frontUrl,
      backendUrl: BACKEND_URL,
    }
    const sebPlist = buildSEBXml(params, sebSettings)

    try {
      const examsFolder = path.join(process.cwd(), "examenes")
      if (!fs.existsSync(examsFolder)) fs.mkdirSync(examsFolder)
      borrarPruebasViejas(examsFolder)

      const fileName = `prueba_${crypto.randomUUID()}.seb`
      fs.writeFileSync(path.join(examsFolder, fileName), sebPlist, "utf8")

      const backendHost = BACKEND_URL.replace(/^https?:\/\//, '')
      res.json({
        sebUrl: `seb://${backendHost}/examenes/${fileName}`,
        archivoUrl: `${BACKEND_URL}/examenes/${fileName}`
      })
    } catch (error) {
      console.error('Error generando .seb de prueba:', error)
      res.status(500).json({ error: "No se pudo generar el archivo de prueba" })
    }
  })

  // GET /exam-start/preview/:examId - Examen para la vista previa dentro de SEB,
  // autorizado con el token corto de vista previa (no con la sesión del profesor)
  router.get("/preview/:examId", async (req: Request, res: Response) => {
    const examId = Number(req.params.examId)
    const previewToken = req.header('Authorization')?.replace(/^Bearer\s+/i, '')

    if (!Number.isInteger(examId) || examId < 1 || !previewToken) {
      return res.status(401).json({ error: "Vista previa no autorizada" })
    }

    const profesorId = verifySEBPreviewToken(previewToken, examId)
    if (!profesorId) {
      return res.status(401).json({ error: "La vista previa venció. Generá un archivo de prueba nuevo desde la ventana." })
    }

    try {
      const result = await getExamForSEBPreview(prisma, examId, profesorId)
      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.error })
      }
      res.json(result.exam)
    } catch (error) {
      console.error('Error cargando vista previa SEB:', error)
      res.status(500).json({ error: "No se pudo cargar la vista previa" })
    }
  })

  return router
}

export default ExamStartRoute
