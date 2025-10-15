import { Router, type Request, type Response } from "express"
import { type PrismaClient } from "@prisma/client"
import crypto from "crypto"
import 'dotenv/config';
import fs from "fs"
import path from "path"

const ExamStartRoute = (prisma: PrismaClient) => {
  const router = Router()
  const FRONTEND_URL1 = process.env.FRONTEND_URL || "http://localhost:3000"
  const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`
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

   const frontUrl = `${FRONTEND_URL1}/exam-attempt/${examId}?windowId=${windowId}&token=${token}`;
const escapedFrontUrl = frontUrl.replace(/&/g, '&amp;');

    // URL para salir de SEB - PRUEBA CON GOOGLE
    const quitUrl = `https://ferrocarriloeste.com.ar/`;

const sebPlist = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>sebMode</key>
    <integer>0</integer>
    <key>kioskMode</key>
    <integer>0</integer>
    <key>startURL</key>
    <string>${escapedFrontUrl}</string>
    <key>allowQuit</key>
    <true />
    <key>browserViewMode</key>
    <integer>0</integer>
    <key>quitURLConfirm</key>
    <false />
    <key>hashedAdminPassword</key>
    <string>${hashedSettingsPassword}</string>
    <key>allowedDisplaysMaxNumber</key>
    <integer>5</integer>
    <key>allowedDisplayBuiltin</key>
    <true />
    <key>browserWindowAllowReload</key>
    <true />
    <key>showTaskBar</key>
    <true />
    <key>allowSwitchToApplications</key>
    <true />
    <key>enableAltEsc</key>
    <true />
    <key>enableAltTab</key>
    <true />
    <key>enableEsc</key>
    <true />
    <key>urlFilterEnable</key>
    <false />
    <key>sebConfigPurpose</key>
    <integer>0</integer>
    <key>originatorVersion</key>
    <string>SEB_Win_2.1.1</string>
    <key>startResource</key>
    <string />
    <key>sebServerURL</key>
    <string />
    <key>ignoreExitKeys</key>
    <true />
    <key>hashedQuitPassword</key>
    <string />
    <key>exitKey1</key>
    <integer>2</integer>
    <key>exitKey2</key>
    <integer>10</integer>
    <key>exitKey3</key>
    <integer>5</integer>
    <key>browserMessagingSocket</key>
    <string>ws://localhost:8706</string>
    <key>browserMessagingPingTime</key>
    <integer>120000</integer>
    <key>allowPreferencesWindow</key>
    <true />
    <key>useAsymmetricOnlyEncryption</key>
    <false />
    <key>browserWindowAllowAddressBar</key>
    <false />
    <key>newBrowserWindowAllowAddressBar</key>
    <false />
    <key>mainBrowserWindowWidth</key>
    <string>100%</string>
    <key>mainBrowserWindowHeight</key>
    <string>100%</string>
    <key>mainBrowserWindowPositioning</key>
    <integer>1</integer>
    <key>enableBrowserWindowToolbar</key>
    <false />
    <key>hideBrowserWindowToolbar</key>
    <false />
    <key>showMenuBar</key>
    <false />
    <key>showSideMenu</key>
    <true />
    <key>taskBarHeight</key>
    <integer>40</integer>
    <key>touchOptimized</key>
    <false />
    <key>enableZoomText</key>
    <true />
    <key>enableZoomPage</key>
    <true />
    <key>zoomMode</key>
    <integer>0</integer>
    <key>allowSpellCheck</key>
    <false />
    <key>allowDictionaryLookup</key>
    <false />
    <key>allowSpellCheckDictionary</key>
    <array></array>
    <key>additionalDictionaries</key>
    <array></array>
    <key>showReloadButton</key>
    <true />
    <key>showTime</key>
    <true />
    <key>showInputLanguage</key>
    <true />
    <key>enableTouchExit</key>
    <false />
    <key>oskBehavior</key>
    <integer>2</integer>
    <key>audioControlEnabled</key>
    <true />
    <key>audioMute</key>
    <false />
    <key>audioVolumeLevel</key>
    <integer>25</integer>
    <key>audioSetVolumeLevel</key>
    <false />
    <key>allowDeveloperConsole</key>
    <false />
    <key>batteryChargeThresholdCritical</key>
    <real>0.1</real>
    <key>batteryChargeThresholdLow</key>
    <real>0.2</real>
    <key>browserScreenKeyboard</key>
    <false />
    <key>newBrowserWindowByLinkPolicy</key>
    <integer>2</integer>
    <key>newBrowserWindowByScriptPolicy</key>
    <integer>2</integer>
    <key>newBrowserWindowByLinkBlockForeign</key>
    <false />
    <key>newBrowserWindowByScriptBlockForeign</key>
    <false />
    <key>newBrowserWindowByLinkWidth</key>
    <string>1000</string>
    <key>newBrowserWindowByLinkHeight</key>
    <string>100%</string>
    <key>newBrowserWindowByLinkPositioning</key>
    <integer>2</integer>
    <key>newBrowserWindowShowURL</key>
    <integer>0</integer>
    <key>browserWindowShowURL</key>
    <integer>0</integer>
    <key>enablePlugIns</key>
    <true />
    <key>enableJava</key>
    <false />
    <key>enableJavaScript</key>
    <true />
    <key>blockPopUpWindows</key>
    <false />
    <key>allowVideoCapture</key>
    <false />
    <key>allowAudioCapture</key>
    <false />
    <key>allowBrowsingBackForward</key>
    <false />
    <key>newBrowserWindowNavigation</key>
    <true />
    <key>removeBrowserProfile</key>
    <true />
    <key>removeLocalStorage</key>
    <false />
    <key>enableSebBrowser</key>
    <true />
    <key>newBrowserWindowAllowReload</key>
    <true />
    <key>showReloadWarning</key>
    <true />
    <key>newBrowserWindowShowReloadWarning</key>
    <false />
    <key>browserUserAgentWinDesktopMode</key>
    <integer>0</integer>
    <key>browserUserAgentWinDesktopModeCustom</key>
    <string />
    <key>browserUserAgentWinTouchMode</key>
    <integer>0</integer>
    <key>browserUserAgentWinTouchModeIPad</key>
    <string>Mozilla/5.0 (iPad; CPU OS 11_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.3 Mobile/15E216 Safari/605.1.15</string>
    <key>browserUserAgentWinTouchModeCustom</key>
    <string />
    <key>browserUserAgent</key>
    <string />
    <key>browserUserAgentMac</key>
    <integer>0</integer>
    <key>browserUserAgentMacCustom</key>
    <string />
    <key>browserWindowTitleSuffix</key>
    <string />
    <key>allowPDFReaderToolbar</key>
    <false />
    <key>allowFind</key>
    <true />
    <key>allowPrint</key>
    <false />
    <key>allowCustomDownUploadLocation</key>
    <false />
    <key>downloadDirectoryOSX</key>
    <string>~/Downloads</string>
    <key>downloadDirectoryWin</key>
    <string />
    <key>openDownloads</key>
    <false />
    <key>chooseFileToUploadPolicy</key>
    <integer>0</integer>
    <key>downloadPDFFiles</key>
    <false />
    <key>allowPDFPlugIn</key>
    <false />
    <key>downloadAndOpenSebConfig</key>
    <true />
    <key>backgroundOpenSEBConfig</key>
    <false />
    <key>useTemporaryDownUploadDirectory</key>
    <false />
    <key>browserShowFileSystemElementPath</key>
    <true />
    <key>allowDownloads</key>
    <true />
    <key>allowUploads</key>
    <false />
    <key>examKeySalt</key>
    <data>8PApcp1uLg+UzlJ+zy8ErtclLF3/FNZ8+xsb/9wjeOc=</data>
    <key>examSessionClearCookiesOnEnd</key>
    <true />
    <key>examSessionClearCookiesOnStart</key>
    <true />
    <key>browserExamKey</key>
    <string />
    <key>browserURLSalt</key>
    <true />
    <key>sendBrowserExamKey</key>
    <false />
    <key>quitURL</key>
<string>https://ferrocarriloeste.com.ar/</string>
    <key>restartExamURL</key>
    <string />
    <key>restartExamUseStartURL</key>
    <false />
    <key>restartExamText</key>
    <string />
    <key>restartExamPasswordProtected</key>
    <true />
    <key>examSessionReconfigureAllow</key>
    <false />
    <key>examSessionReconfigureConfigURL</key>
    <string />
    <key>quitURLRestart</key>
    <false />
    <key>startURLAppendQueryParameter</key>
    <false />
    <key>additionalResources</key>
    <array></array>
    <key>monitorProcesses</key>
    <false />
    <key>allowFlashFullscreen</key>
    <false />
    <key>permittedProcesses</key>
    <array></array>
    <key>prohibitedProcesses</key>
    <array>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Guilded.exe</string>
        <key>originalName</key>
        <string>Guilded.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>sethc.exe</string>
        <key>originalName</key>
        <string>sethc.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>vlc.exe</string>
        <key>originalName</key>
        <string>vlc.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Microsoft.Media.Player.exe</string>
        <key>originalName</key>
        <string>Microsoft.Media.Player.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>spotify.exe</string>
        <key>originalName</key>
        <string>spotify.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>obs32.exe</string>
        <key>originalName</key>
        <string>obs32.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>obs64.exe</string>
        <key>originalName</key>
        <string>obs64.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>pcmontask.exe</string>
        <key>originalName</key>
        <string>pcmontask.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>PCMonitorSrv.exe</string>
        <key>originalName</key>
        <string>PCMonitorSrv.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>strwinclt.exe</string>
        <key>originalName</key>
        <string>strwinclt.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>SRServer.exe</string>
        <key>originalName</key>
        <string>SRServer.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>remoting_host.exe</string>
        <key>originalName</key>
        <string>remoting_host.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>CiscoWebExStart.exe</string>
        <key>originalName</key>
        <string>CiscoWebExStart.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>CiscoCollabHost.exe</string>
        <key>originalName</key>
        <string>CiscoCollabHost.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>AA_v3.exe</string>
        <key>originalName</key>
        <string>AA_v3.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>ptoneclk.exe</string>
        <key>originalName</key>
        <string>ptoneclk.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>webexmta.exe</string>
        <key>originalName</key>
        <string>webexmta.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>MS-Teams.exe</string>
        <key>originalName</key>
        <string>MS-Teams.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Teams.exe</string>
        <key>originalName</key>
        <string>Teams.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>join.me.sentinel.exe</string>
        <key>originalName</key>
        <string>join.me.sentinel.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>join.me.exe</string>
        <key>originalName</key>
        <string>join.me.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>g2mstart.exe</string>
        <key>originalName</key>
        <string>g2mstart.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>g2mlauncher.exe</string>
        <key>originalName</key>
        <string>g2mlauncher.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>g2mcomm.exe</string>
        <key>originalName</key>
        <string>g2mcomm.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Telegram.exe</string>
        <key>originalName</key>
        <string>Telegram.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Zoom.exe</string>
        <key>originalName</key>
        <string>Zoom.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Element.exe</string>
        <key>originalName</key>
        <string>Element.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>slack.exe</string>
        <key>originalName</key>
        <string>slack.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>CamtasiaUtl.exe</string>
        <key>originalName</key>
        <string>CamtasiaUtl.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>CamRecorder.exe</string>
        <key>originalName</key>
        <string>CamRecorder.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>CamPlay.exe</string>
        <key>originalName</key>
        <string>CamPlay.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Camtasia_Studio.exe</string>
        <key>originalName</key>
        <string>Camtasia_Studio.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>CamtasiaStudio.exe</string>
        <key>originalName</key>
        <string>CamtasiaStudio.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Camtasia.exe</string>
        <key>originalName</key>
        <string>Camtasia.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>DiscordCanary.exe</string>
        <key>originalName</key>
        <string>DiscordCanary.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>DiscordPTB.exe</string>
        <key>originalName</key>
        <string>DiscordPTB.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Discord.exe</string>
        <key>originalName</key>
        <string>Discord.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>RPCSuite.exe</string>
        <key>originalName</key>
        <string>RPCSuite.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>RPCService.exe</string>
        <key>originalName</key>
        <string>RPCService.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>RemotePCDesktop.exe</string>
        <key>originalName</key>
        <string>RemotePCDesktop.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>beamyourscreen-host.exe</string>
        <key>originalName</key>
        <string>beamyourscreen-host.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>AeroAdmin.exe</string>
        <key>originalName</key>
        <string>AeroAdmin.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Mikogo-host.exe</string>
        <key>originalName</key>
        <string>Mikogo-host.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>chromoting.exe</string>
        <key>originalName</key>
        <string>chromoting.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>vncserverui.exe</string>
        <key>originalName</key>
        <string>vncserverui.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>vncviewer.exe</string>
        <key>originalName</key>
        <string>vncviewer.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>vncserver.exe</string>
        <key>originalName</key>
        <string>vncserver.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
      <key>allowedProcesses</key>
<array>
    <dict>
        <key>active</key>
        <true/>
        <key>os</key>
        <integer>1</integer> <!-- 1 = Windows -->
        <key>executable</key>
        <string>Discord.exe</string>
        <key>originalName</key>
        <string>Discord.exe</string>
        <key>description</key>
        <string>Discord permitido</string>
    </dict>
</array>
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>GotoMeetingWinStore.exe</string>
        <key>originalName</key>
        <string>GotoMeetingWinStore.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>SkypeHost.exe</string>
        <key>originalName</key>
        <string>SkypeHost.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>SkypeApp.exe</string>
        <key>originalName</key>
        <string>SkypeApp.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
      <dict>
        <key>active</key>
        <true />
        <key>currentUser</key>
        <true />
        <key>strongKill</key>
        <false />
        <key>os</key>
        <integer>1</integer>
        <key>executable</key>
        <string>Skype.exe</string>
        <key>originalName</key>
        <string>Skype.exe</string>
        <key>description</key>
        <string />
        <key>identifier</key>
        <string />
        <key>windowHandlingProcess</key>
        <string />
        <key>user</key>
        <string />
      </dict>
    </array>
    <key>enableURLFilter</key>
    <false />
    <key>enableURLContentFilter</key>
    <false />
    <key>URLFilterRules</key>
    <array></array>
    <key>URLFilterEnable</key>
    <false />
    <key>URLFilterEnableContentFilter</key>
    <false />
    <key>blacklistURLFilter</key>
    <string />
    <key>whitelistURLFilter</key>
    <string />
    <key>urlFilterTrustedContent</key>
    <true />
    <key>urlFilterRegex</key>
    <true />
    <key>embeddedCertificates</key>
    <array></array>
    <key>pinEmbeddedCertificates</key>
    <false />
    <key>proxySettingsPolicy</key>
    <integer>0</integer>
    <key>proxies</key>
    <dict>
      <key>ExceptionsList</key>
      <array></array>
      <key>ExcludeSimpleHostnames</key>
      <false />
      <key>AutoDiscoveryEnabled</key>
      <false />
      <key>AutoConfigurationEnabled</key>
      <false />
      <key>AutoConfigurationJavaScript</key>
      <string />
      <key>AutoConfigurationURL</key>
      <string />
      <key>FTPPassive</key>
      <true />
      <key>HTTPEnable</key>
      <false />
      <key>HTTPPort</key>
      <integer>80</integer>
      <key>HTTPProxy</key>
      <string />
      <key>HTTPRequiresPassword</key>
      <false />
      <key>HTTPUsername</key>
      <string />
      <key>HTTPPassword</key>
      <string />
      <key>HTTPSEnable</key>
      <false />
      <key>HTTPSPort</key>
      <integer>443</integer>
      <key>HTTPSProxy</key>
      <string />
      <key>HTTPSRequiresPassword</key>
      <false />
      <key>HTTPSUsername</key>
      <string />
      <key>HTTPSPassword</key>
      <string />
      <key>FTPEnable</key>
      <false />
      <key>FTPPort</key>
      <integer>21</integer>
      <key>FTPProxy</key>
      <string />
      <key>FTPRequiresPassword</key>
      <false />
      <key>FTPUsername</key>
      <string />
      <key>FTPPassword</key>
      <string />
      <key>SOCKSEnable</key>
      <false />
      <key>SOCKSPort</key>
      <integer>1080</integer>
      <key>SOCKSProxy</key>
      <string />
      <key>SOCKSRequiresPassword</key>
      <false />
      <key>SOCKSUsername</key>
      <string />
      <key>SOCKSPassword</key>
      <string />
      <key>RTSPEnable</key>
      <false />
      <key>RTSPPort</key>
      <integer>554</integer>
      <key>RTSPProxy</key>
      <string />
      <key>RTSPRequiresPassword</key>
      <false />
      <key>RTSPUsername</key>
      <string />
      <key>RTSPPassword</key>
      <string />
    </dict>
    <key>sebServicePolicy</key>
    <integer>1</integer>
    <key>sebServiceIgnore</key>
    <true />
    <key>allowVirtualMachine</key>
    <false />
    <key>allowScreenSharing</key>
    <true />
    <key>enablePrivateClipboard</key>
    <true />
    <key>createNewDesktop</key>
    <false />
    <key>killExplorerShell</key>
    <false />
    <key>enableLogging</key>
    <true />
    <key>allowApplicationLog</key>
    <true />
    <key>showApplicationLogButton</key>
    <true />
    <key>logDirectoryOSX</key>
    <string />
    <key>logDirectoryWin</key>
    <string />
    <key>allowWlan</key>
    <false />
    <key>lockOnMessageSocketClose</key>
    <true />
    <key>minMacOSVersion</key>
    <integer>4</integer>
    <key>enableAppSwitcherCheck</key>
    <true />
    <key>forceAppFolderInstall</key>
    <true />
    <key>allowUserAppFolderInstall</key>
    <false />
    <key>allowSiri</key>
    <false />
    <key>allowDictation</key>
    <false />
    <key>detectStoppedProcess</key>
    <true />
    <key>allowDisplayMirroring</key>
    <false />
    <key>allowedDisplayBuiltinEnforce</key>
    <false />
    <key>allowedDisplaysIgnoreFailure</key>
    <false />
    <key>enableChromeNotifications</key>
    <false />
    <key>enableWindowsUpdate</key>
    <false />
    <key>clipboardPolicy</key>
    <integer>2</integer>
    <key>disableSessionChangeLockScreen</key>
    <false />
    <key>enableCursorVerification</key>
    <true />
    <key>enableSessionVerification</key>
    <true />
    <key>lockScreenBackgroundColor</key>
    <string>#ff0000</string>
    <key>allowStickyKeys</key>
    <true />
    <key>insideSebEnableSwitchUser</key>
    <false />
    <key>insideSebEnableLockThisComputer</key>
    <false />
    <key>insideSebEnableChangeAPassword</key>
    <false />
    <key>insideSebEnableStartTaskManager</key>
    <false />
    <key>insideSebEnableLogOff</key>
    <false />
    <key>insideSebEnableShutDown</key>
    <false />
    <key>insideSebEnableEaseOfAccess</key>
    <false />
    <key>insideSebEnableVmWareClientShade</key>
    <false />
    <key>insideSebEnableNetworkConnectionSelector</key>
    <false />
    <key>setVmwareConfiguration</key>
    <false />
    <key>enableFindPrinter</key>
    <false />
    <key>hookKeys</key>
    <true />
    <key>enableCtrlEsc</key>
    <false />
    <key>enableAltF4</key>
    <false />
    <key>enableStartMenu</key>
    <true />
    <key>enableMiddleMouse</key>
    <false />
    <key>enableRightMouse</key>
    <true />
    <key>enablePrintScreen</key>
    <true />
    <key>enableAltMouseWheel</key>
    <false />
    <key>enableF1</key>
    <true />
    <key>enableF2</key>
    <true />
    <key>enableF3</key>
    <true />
    <key>enableF4</key>
    <true />
    <key>enableF5</key>
    <true />
    <key>enableF6</key>
    <true />
    <key>enableF7</key>
    <true />
    <key>enableF8</key>
    <true />
    <key>enableF9</key>
    <true />
    <key>enableF10</key>
    <true />
    <key>enableF11</key>
    <true />
    <key>enableF12</key>
    <true />
    <key>displayAlwaysOn</key>
    <true />
    <key>systemAlwaysOn</key>
    <true />
  </dict>
</plist>`;



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
