import { type PrismaClient } from "@prisma/client";
import crypto from "crypto";

/**
 * Hashea una contraseña usando SHA-256
 */
function hashSHA256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Interfaz para los parámetros de configuración de SEB
 */
export interface SEBConfigParams {
  examId: number;
  windowId: number;
  token: string;
  frontUrl: string;
  backendUrl: string;
  quitPassword?: string;
  settingsPassword?: string;
}

/**
 * Interfaz para las opciones de configuración del examen
 */
export interface ExamWindowSEBSettings {
  // Modo kiosk
  kioskMode: number;
  // Mostrar barra de tareas
  showTaskBar: boolean;
  // Permitir quitter
  allowQuit: boolean;
  // Modo navegador (0=normal, 1=kiosk)
  browserViewMode: number;
  // Permitir recargar
  allowReload: boolean;
  // Permitir barra de direcciones
  allowAddressBar: boolean;
  // Permitir botones del navegador
  enableBrowserWindowToolbar: boolean;
  // Permitir atrás/adelante del navegador
  allowBrowsingBackForward: boolean;
  // Permitir salir con Esc
  enableEsc: boolean;
  // Permitir Alt+Tab
  enableAltTab: boolean;
  // Permitir Alt+Esc
  enableAltEsc: boolean;
  // Permitir Alt+F4
  enableAltF4: boolean;
  // Permitir menú inicio
  enableStartMenu: boolean;
  // Permitir clic derecho
  enableRightMouse: boolean;
  // Permitir imprimir pantalla
  enablePrintScreen: boolean;
  // Habilitar teclas de función F1-F12
  enableFunctionKeys: boolean;
  // Política de portapapeles (0=permitir todo, 1=bloquear entrada, 2=bloquear todo)
  clipboardPolicy: number;
  // Crear nuevo escritorio
  createNewDesktop: boolean;
  // Bloquear al cerrar socket
  lockOnMessageSocketClose: boolean;
  // Permitir cambio de usuario
  allowSwitchToApplications: boolean;
  // Permitir desarrollo
  allowDeveloperConsole: boolean;
  // Permitir descarga de archivos
  allowDownloads: boolean;
  // Permitir subir archivos
  allowUploads: boolean;
  // URL de salida
  quitUrl: string;
  // Contraseña de salida
  quitPassword: string;
  // Contraseña de configuración
  settingsPassword: string;
}

/**
 * Obtiene la configuración de SEB para una ventana de examen desde la base de datos
 */
export async function getExamWindowSEBSettings(
  prisma: PrismaClient,
  windowId: number
): Promise<ExamWindowSEBSettings | null> {
  const examWindow = await prisma.examWindow.findUnique({
    where: { id: windowId },
    include: {
      exam: true,
    },
  });

  if (!examWindow) {
    return null;
  }

  // Valores por defecto - leer desde la base de datos
  const defaults: ExamWindowSEBSettings = {
    // Modo kiosk
    kioskMode: (examWindow as any).sebKioskMode ?? examWindow.kioskMode || 0,
    showTaskBar: (examWindow as any).sebShowTaskBar ?? examWindow.kioskMode === 1,
    allowQuit: (examWindow as any).sebAllowQuit ?? true,
    browserViewMode: (examWindow as any).sebBrowserViewMode ?? examWindow.kioskMode || 0,
    allowReload: (examWindow as any).sebAllowReload ?? true,
    allowAddressBar: (examWindow as any).sebAllowAddressBar ?? false,
    enableBrowserWindowToolbar: (examWindow as any).sebEnableBrowserWindowToolbar ?? false,
    allowBrowsingBackForward: (examWindow as any).sebAllowBrowsingBackForward ?? false,
    
    // Teclado
    enableEsc: (examWindow as any).sebEnableEsc ?? false,
    enableAltTab: (examWindow as any).sebEnableAltTab ?? false,
    enableAltEsc: (examWindow as any).sebEnableAltEsc ?? false,
    enableAltF4: (examWindow as any).sebEnableAltF4 ?? false,
    enableStartMenu: (examWindow as any).sebEnableStartMenu ?? false,
    enableRightMouse: (examWindow as any).sebEnableRightMouse ?? true,
    enablePrintScreen: (examWindow as any).sebEnablePrintScreen ?? true,
    enableFunctionKeys: (examWindow as any).sebEnableFunctionKeys ?? true,
    
    // Seguridad
    clipboardPolicy: (examWindow as any).sebClipboardPolicy ?? 2,
    createNewDesktop: (examWindow as any).sebCreateNewDesktop ?? true,
    lockOnMessageSocketClose: (examWindow as any).sebLockOnMessageSocketClose ?? true,
    allowSwitchToApplications: (examWindow as any).sebAllowSwitchToApplications ?? false,
    allowDeveloperConsole: (examWindow as any).sebAllowDeveloperConsole ?? false,
    
    // Archivos
    allowDownloads: (examWindow as any).sebAllowDownloads ?? true,
    allowUploads: (examWindow as any).sebAllowUploads ?? false,
    
    // URLs y contraseñas
    quitUrl: (examWindow as any).sebQuitUrl ?? "https://ferocarcineto.com.ar/",
    quitPassword: (examWindow as any).sebQuitPassword ?? "12345",
    settingsPassword: (examWindow as any).sebSettingsPassword ?? "12345",
  };

  return defaults;
}

/**
 * Construye el XML de configuración de SEB basado en las opciones de la base de datos
 */
export function buildSEBXml(
  params: SEBConfigParams,
  settings: ExamWindowSEBSettings
): string {
  const { examId, frontUrl, backendUrl, quitPassword, settingsPassword } = params;

  // Hashear contraseñas
  const hashedQuitPassword = hashSHA256(quitPassword || settings.quitPassword);
  const hashedSettingsPassword = hashSHA256(settingsPassword || settings.settingsPassword);

  // Escapar URL para XML
  const escapedFrontUrl = frontUrl.replace(/&/g, "&amp;");

  // Determinar valores basados en configuración
  const kioskModeValue = settings.kioskMode;
  const windowsTaskBar = settings.showTaskBar;

  // URL de salida
  const quitUrl = settings.quitUrl;

  // Construir el XML de SEB
  const sebPlist = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>sebMode</key>
    <integer>0</integer>
    <key>kioskMode</key>
    <integer>${kioskModeValue}</integer>
    <key>startURL</key>
    <string>${escapedFrontUrl}</string>
    <key>allowQuit</key>
    <${settings.allowQuit ? "true" : "false"} />
    <key>browserViewMode</key>
    <integer>${settings.browserViewMode}</integer>
    <key>quitURLConfirm</key>
    <false />
    <key>hashedAdminPassword</key>
    <string>${hashedSettingsPassword}</string>
    <key>allowedDisplaysMaxNumber</key>
    <integer>5</integer>
    <key>allowedDisplayBuiltin</key>
    <true />
    <key>browserWindowAllowReload</key>
    <${settings.allowReload ? "true" : "false"} />
    <key>showTaskBar</key>
    <${settings.showTaskBar ? "true" : "false"}/>
    <key>allowSwitchToApplications</key>
    <${settings.allowSwitchToApplications ? "true" : "false"}/>
    <key>enableAltEsc</key>
    <${settings.enableAltEsc ? "true" : "false"} />
    <key>enableAltTab</key>
    <${settings.enableAltTab ? "true" : "false"} />
    <key>enableEsc</key>
    <${settings.enableEsc ? "true" : "false"} />
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
    <string>${hashedQuitPassword}</string>
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
    <${settings.allowAddressBar ? "true" : "false"} />
    <key>newBrowserWindowAllowAddressBar</key>
    <${settings.allowAddressBar ? "true" : "false"} />
    <key>mainBrowserWindowWidth</key>
    <string>100%</string>
    <key>mainBrowserWindowHeight</key>
    <string>100%</string>
    <key>mainBrowserWindowPositioning</key>
    <integer>1</integer>
    <key>enableBrowserWindowToolbar</key>
    <${settings.enableBrowserWindowToolbar ? "true" : "false"} />
    <key>hideBrowserWindowToolbar</key>
    <${windowsTaskBar ? "true" : "false"} />
    <key>showMenuBar</key>
    <false />
    <key>showSideMenu</key>
    <false />
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
    <${settings.allowReload ? "true" : "false"} />
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
    <${settings.allowDeveloperConsole ? "true" : "false"} />
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
    <${settings.allowBrowsingBackForward ? "true" : "false"} />
    <key>newBrowserWindowNavigation</key>
    <true />
    <key>removeBrowserProfile</key>
    <true />
    <key>removeLocalStorage</key>
    <false />
    <key>enableSebBrowser</key>
    <true />
    <key>newBrowserWindowAllowReload</key>
    <${settings.allowReload ? "true" : "false"} />
    <key>showReloadWarning</key>
    <${settings.allowReload ? "true" : "false"} />
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
    <${settings.allowDownloads ? "true" : "false"} />
    <key>allowUploads</key>
    <${settings.allowUploads ? "true" : "false"} />
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
    <string>${quitUrl}</string>
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
    <true />
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
        <string>D.exe</string>
        <key>originalName</key>
        <string>D.exe</string>
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
    <${settings.createNewDesktop ? "true" : "false"} />
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
    <${settings.lockOnMessageSocketClose ? "true" : "false"} />
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
    <integer>${settings.clipboardPolicy}</integer>
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
    <${settings.enableAltF4 ? "true" : "false"} />
    <key>enableStartMenu</key>
    <${settings.enableStartMenu ? "true" : "false"} />
    <key>enableMiddleMouse</key>
    <false />
    <key>enableRightMouse</key>
    <${settings.enableRightMouse ? "true" : "false"} />
    <key>enablePrintScreen</key>
    <${settings.enablePrintScreen ? "true" : "false"} />
    <key>enableAltMouseWheel</key>
    <false />
    <key>enableF1</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF2</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF3</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF4</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF5</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF6</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF7</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF8</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF9</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF10</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF11</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>enableF12</key>
    <${settings.enableFunctionKeys ? "true" : "false"} />
    <key>displayAlwaysOn</key>
    <true />
    <key>systemAlwaysOn</key>
    <true />
  </dict>
</plist>`;

  return sebPlist;
}

/**
 * Actualiza la configuración de SEB para una ventana de examen
 */
export async function updateExamWindowSEBSettings(
  prisma: PrismaClient,
  windowId: number,
  settings: Partial<ExamWindowSEBSettings>
): Promise<boolean> {
  try {
    // Mapear las configuraciones a campos del modelo
    const updateData: any = {};

    if (settings.kioskMode !== undefined) {
      updateData.kioskMode = settings.kioskMode;
    }

    // Aquí puedes agregar más campos según sea necesario
    // Por ejemplo, si agregas más campos a ExamWindow en el schema.prisma

    await prisma.examWindow.update({
      where: { id: windowId },
      data: updateData,
    });

    return true;
  } catch (error) {
    console.error("Error updating SEB settings:", error);
    return false;
  }
}