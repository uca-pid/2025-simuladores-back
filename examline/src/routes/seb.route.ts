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

  // Ruta para descargar el .seb dinámico
  router.get("/download/:examId/:windowId/:token", async (req: Request, res: Response) => {
    const { examId, windowId, token } = req.params
    const contra = "12345" // contraseña para quit/admin

    // Obtener URLs desde variables de entorno o valores por defecto
    const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "")
    const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "")

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

    const frontUrl = `${frontendBaseUrl}/exam-attempt/${examId}?windowId=${windowId}&token=${token}`;

    // Construir parámetros para el builder
    const params: SEBConfigParams = {
      examId: Number(examId),
      windowId: Number(windowId),
      token,
      frontUrl,
      backendUrl: backendBaseUrl,
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
    // Construir la URL usando el host del backend (removiendo http:// o https://)
    const backendHost = backendBaseUrl.replace(/^https?:\/\//, '');
    const sebUrl = `seb://${backendHost}/examenes/${fileName}`;
    res.json({ sebUrl });
    
  })

  // Ruta para probar la configuración dinámica
  router.post("/test-download", async (req: Request, res: Response) => {
    const settingsFromBody = req.body;
    const contra = "12345";

    const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");

    // Generar configuración por defecto y sobrescribir con lo que viene del front
    const sebSettings: ExamWindowSEBSettings = {
      unsafeMode: settingsFromBody.sebUnsafeMode ?? false,
      kioskMode: settingsFromBody.kioskMode ?? 0,
      showTaskBar: settingsFromBody.sebShowTaskBar ?? false,
      allowQuit: settingsFromBody.sebAllowQuit ?? true,
      browserViewMode: settingsFromBody.sebBrowserViewMode ?? 0,
      allowReload: settingsFromBody.sebAllowReload ?? true,
      allowAddressBar: settingsFromBody.sebAllowAddressBar ?? false,
      enableBrowserWindowToolbar: settingsFromBody.sebEnableBrowserWindowToolbar ?? false,
      allowBrowsingBackForward: settingsFromBody.sebAllowBrowsingBackForward ?? false,
      enableEsc: settingsFromBody.sebEnableEsc ?? false,
      enableAltTab: settingsFromBody.sebEnableAltTab ?? false,
      enableAltEsc: settingsFromBody.sebEnableAltEsc ?? false,
      enableAltF4: settingsFromBody.sebEnableAltF4 ?? false,
      enableStartMenu: settingsFromBody.sebEnableStartMenu ?? false,
      enableRightMouse: settingsFromBody.sebEnableRightMouse ?? true,
      enablePrintScreen: settingsFromBody.sebEnablePrintScreen ?? true,
      enableFunctionKeys: settingsFromBody.sebEnableFunctionKeys ?? true,
      clipboardPolicy: settingsFromBody.sebClipboardPolicy ?? 2,
      createNewDesktop: settingsFromBody.sebCreateNewDesktop ?? true,
      lockOnMessageSocketClose: settingsFromBody.sebLockOnMessageSocketClose ?? true,
      allowSwitchToApplications: settingsFromBody.sebAllowSwitchToApplications ?? false,
      allowDeveloperConsole: settingsFromBody.sebAllowDeveloperConsole ?? false,
      allowDownloads: settingsFromBody.sebAllowDownloads ?? true,
      allowUploads: settingsFromBody.sebAllowUploads ?? false,
      quitUrl: settingsFromBody.sebQuitUrl || "https://ferocarcineto.com.ar/",
      quitPassword: settingsFromBody.sebQuitPassword || "12345",
      settingsPassword: settingsFromBody.sebSettingsPassword || "12345",
      allowZoom: settingsFromBody.sebAllowZoom ?? false,
      allowTeams: settingsFromBody.sebAllowTeams ?? false,
      browserWindowAllowMinimize: settingsFromBody.sebBrowserWindowAllowMinimize ?? false,
      enableTaskManager: settingsFromBody.sebEnableTaskManager ?? false,
    };

    const frontUrl = `${frontendBaseUrl}/`; // URL de prueba, lleva al inicio

    const params: SEBConfigParams = {
      examId: 99999, // Dummy
      windowId: 99999,
      token: "test-token",
      frontUrl,
      backendUrl: backendBaseUrl,
      quitPassword: contra,
      settingsPassword: contra,
    };

    const sebPlist = buildSEBXml(params, sebSettings);

    const examsFolder = path.join(process.cwd(), "examenes");
    if (!fs.existsSync(examsFolder)) fs.mkdirSync(examsFolder);
    const fileName = `test_config_${Date.now()}.seb`;
    const filePath = path.join(examsFolder, fileName);

    fs.writeFileSync(filePath, sebPlist, "utf8");

    const backendHost = backendBaseUrl.replace(/^https?:\/\//, '');
    const sebUrl = `seb://${backendHost}/examenes/${fileName}`;
    res.json({ sebUrl });
  })

  return router
}

export default ExamStartRoute
