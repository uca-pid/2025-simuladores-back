import { Router, type Request, type Response } from "express"
import { type PrismaClient } from "@prisma/client"
import crypto from "crypto"

const ExamStartRoute = (prisma: PrismaClient) => {
  const router = Router()

  // Función para hashear con SHA-256
  function hashSHA256(text: string) {
    return crypto.createHash("sha256").update(text).digest("hex")
  }

  // Ruta para descargar el .seb dinámico
  router.get("/download/:examId/:windowId/:token", async (req: Request, res: Response) => {
    const { examId, windowId, token } = req.params
    const contra = "12345" // contraseña para quit/admin

    // Validar que el examen exista en la base de datos
    const exam = await prisma.exam.findUnique({
      where: { id: Number(examId) }
    })

    if (!exam) return res.status(404).json({ error: "Examen no encontrado" })

    const hashedQuitPassword = hashSHA256(contra)
    const hashedSettingsPassword = hashSHA256(contra)

    // URL del frontend que SEB abrirá
    const frontUrl = `http://localhost:3000/exam-attempt/${examId}?windowId=${windowId}?token=${token}`

    const sebPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>startMode</key>
    <string>browser</string>
    <key>startURL</key>
    <string>${frontUrl}</string>
    <key>allowQuit</key>
    <true/>
    <key>fullScreen</key>
    <false/>
    <key>kioskMode</key>
    <false/>
    <key>urlFilterEnable</key>
    <false/>
    <key>allowSwitchToApplications</key>
    <true/>
    <key>allowMultipleInstances</key>
    <true/>
  </dict>
</plist>`

    // Forzar descarga del .seb
    res.setHeader("Content-Disposition", `attachment; filename=examen_${examId}.seb`)
    res.setHeader("Content-Type", "application/xml") // también puedes dejar application/seb
    res.send(sebPlist)
  })

  return router
}

export default ExamStartRoute
