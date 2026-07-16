/**
 * Electron main process entrypoint.
 *
 * Creates the main application window, initializes the IPC registry,
 * and registers command handlers.
 *
 * Version: 0.3.0 | 2026-07-16
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { initIpcRegistry } from './ipc/registry';
import { registerPingHandler } from './ipc/ping';
import { registerProjectHandlers } from './ipc/handlers/project';
import { registerOutlineHandlers } from './ipc/handlers/outline';
import { registerVariableHandlers } from './ipc/handlers/variables';
import { registerSecretsHandlers } from './ipc/handlers/secrets';
import { registerGenerationHandlers } from './ipc/handlers/generation';
import { registerChapterHandlers } from './ipc/handlers/chapter';
import { registerHistoryHandlers } from './ipc/handlers/history';
import { ProjectService } from './services/ProjectService';
import { VariableService } from './services/VariableService';
import { SecretsService } from './services/SecretsService';
import { GenerationService } from './services/GenerationService';
import { ChapterService } from './services/ChapterService';
import { StalenessService } from './services/StalenessService';
import { HistoryService } from './services/HistoryService';
import { TemplateEngine } from './services/TemplateEngine';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Create services before the window so handlers are ready
  const projectService = new ProjectService(app.getPath('userData'));
  const variableService = new VariableService(projectService);
  const secretsService = new SecretsService(app.getPath('userData'));
  const templateEngine = new TemplateEngine();
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
  registerProjectHandlers(projectService);
  registerOutlineHandlers(projectService, stalenessService);
  registerVariableHandlers(variableService, stalenessService);
  registerSecretsHandlers(secretsService);
  registerGenerationHandlers(generationService);
  registerChapterHandlers(chapterService);
  const historyService = new HistoryService(projectService);
  registerHistoryHandlers(historyService);

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
