/**
 * Electron main process entrypoint.
 *
 * Creates the main application window, initializes the IPC registry,
 * registers command handlers, builds the native menu, and optionally
 * re-opens the last active project on startup.
 *
 * Version: 0.4.0 | 2026-07-17
 */

import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { initIpcRegistry } from './ipc/registry';
import { registerPingHandler } from './ipc/ping';
import { registerProjectHandlers } from './ipc/handlers/project';
import { registerOutlineHandlers } from './ipc/handlers/outline';
import { registerVariableHandlers } from './ipc/handlers/variables';
import { registerSecretsHandlers } from './ipc/handlers/secrets';
import { registerGenerationHandlers } from './ipc/handlers/generation';
import { registerChapterHandlers } from './ipc/handlers/chapter';
import { registerVersionHandlers } from './ipc/handlers/versions';
import { registerHistoryHandlers } from './ipc/handlers/history';
import { ProjectService } from './services/ProjectService';
import { AppStateService } from './services/AppStateService';
import { VariableService } from './services/VariableService';
import { SecretsService } from './services/SecretsService';
import { GenerationService } from './services/GenerationService';
import { ChapterService } from './services/ChapterService';
import { VersionService } from './services/VersionService';
import { StalenessService } from './services/StalenessService';
import { HistoryService } from './services/HistoryService';
import { TemplateEngine } from './services/TemplateEngine';
import { ExportService } from './services/ExportService';
import { registerExportHandlers } from './ipc/handlers/export';
import { buildMenu, createActionInvoker } from './menu';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  // Create services before the window so handlers are ready
  const userDataPath = app.getPath('userData');
  const projectService = new ProjectService(userDataPath);
  const appStateService = new AppStateService(userDataPath);
  const historyService = new HistoryService(projectService);
  const variableService = new VariableService(projectService, historyService);
  projectService.variableService = variableService; // resolve circular dep
  const secretsService = new SecretsService(userDataPath);
  const templateEngine = new TemplateEngine(
    path.join(app.getAppPath(), 'src', 'main', 'templates'),
  );
  const stalenessService = new StalenessService(projectService, variableService);
  const chapterService = new ChapterService(projectService, stalenessService);
  const generationService = new GenerationService(
    projectService,
    variableService,
    templateEngine,
    secretsService,
    stalenessService,
  );

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Plotline',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Initialize IPC after window creation so handlers have a window context
  initIpcRegistry();
  registerPingHandler();
  const window = mainWindow;
  registerProjectHandlers(projectService, appStateService);
  registerOutlineHandlers(projectService, stalenessService, appStateService);
  registerVariableHandlers(variableService, stalenessService);
  registerSecretsHandlers(secretsService);
  registerGenerationHandlers(generationService);
  registerChapterHandlers(chapterService);
  registerHistoryHandlers(historyService);
  const versionService = new VersionService(projectService);
  registerVersionHandlers(versionService);
  const exportService = new ExportService(projectService);
  registerExportHandlers(exportService);

  // Build and set native menu
  const recents = await appStateService.getRecents();
  const actions = createActionInvoker(window);
  const menu = buildMenu(window, recents, actions);
  Menu.setApplicationMenu(menu);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
