/**
 * Native application menu builder.
 *
 * Exports `buildMenu()` which constructs a full Electron native menu for
 * Plotline. Menu items that need to communicate with the renderer send
 * events via `window.webContents.send()` on the IPC event channel.
 *
 * The menu is built once at startup. To refresh dynamic content (recents,
 * checkmarks), call `buildMenu()` again and set the result with
 * `Menu.setApplicationMenu()`.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { Menu, BrowserWindow, app, dialog, type MenuItemConstructorOptions } from 'electron';
import { IPC_EVENT_CHANNEL } from '../shared/ipc';
import type { RecentEntry } from './services/AppStateService';

// ── Public types ───────────────────────────────────────────────────────────

export type { RecentEntry } from './services/AppStateService';

export interface MenuActions {
  newProject: () => void;
  openProject: () => void;
  closeProject: () => void;
  findInChapter: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setUiScale: (scale: number) => void;
  setEditorFontSize: (size: number) => void;
}

// ── Helper: send menu action event to renderer ─────────────────────────────

function sendMenuAction(window: BrowserWindow, action: string, value?: string | number): void {
  window.webContents.send(IPC_EVENT_CHANNEL, {
    event: 'menu:action',
    payload: { action, value },
  });
}

// ── Helper: create action invoker from a window ────────────────────────────

export function createActionInvoker(window: BrowserWindow): MenuActions {
  return {
    newProject: () => sendMenuAction(window, 'new-project'),
    openProject: () => sendMenuAction(window, 'open-project'),
    closeProject: () => sendMenuAction(window, 'close-project'),
    findInChapter: () => sendMenuAction(window, 'find-in-chapter'),
    setTheme: (theme) => sendMenuAction(window, 'set-theme', theme),
    setUiScale: (scale) => sendMenuAction(window, 'set-ui-scale', scale),
    setEditorFontSize: (size) => sendMenuAction(window, 'set-editor-font-size', size),
  };
}

// ── Build menu ─────────────────────────────────────────────────────────────

/**
 * Build the full native application menu.
 *
 * @param window  - The main BrowserWindow (used to send events to renderer).
 * @param recents - Current recents list (from AppStateService) for Open Recent submenu.
 * @param actions - Action callbacks that map menu items to main-process/renderer logic.
 */
export function buildMenu(
  window: BrowserWindow,
  recents: RecentEntry[],
  actions: MenuActions,
): Menu {
  // ── Recent submenu items ───────────────────────────────────────────
  const recentSubmenu: MenuItemConstructorOptions[] =
    recents.length > 0
      ? recents.map((r) => ({
          label: r.title,
          click: () => sendMenuAction(window, 'open-recent', r.projectId),
        }))
      : [{ label: 'No Recent Projects', enabled: false }];

  // ── Theme submenu ──────────────────────────────────────────────────
  const themeSubmenu: MenuItemConstructorOptions[] = [
    { label: 'Light', type: 'radio', click: () => actions.setTheme('light') },
    { label: 'Dark', type: 'radio', click: () => actions.setTheme('dark') },
  ];

  // ── UI Scale submenu ───────────────────────────────────────────────
  const uiScaleSubmenu: MenuItemConstructorOptions[] = [90, 100, 110, 125, 150].map(
    (scale) => ({
      label: `${scale}%`,
      type: 'radio' as const,
      click: () => actions.setUiScale(scale),
    }),
  );

  // ── Editor Font Size submenu ───────────────────────────────────────
  const editorFontSubmenu: MenuItemConstructorOptions[] = [16, 18, 19, 20, 22, 24].map(
    (size) => ({
      label: `${size}px`,
      type: 'radio' as const,
      click: () => actions.setEditorFontSize(size),
    }),
  );

  // ── Template ───────────────────────────────────────────────────────
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => actions.newProject(),
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => actions.openProject(),
        },
        { type: 'separator' },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        {
          label: 'Close Project',
          accelerator: 'CmdOrCtrl+W',
          click: () => actions.closeProject(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Chapter',
          accelerator: 'CmdOrCtrl+F',
          click: () => actions.findInChapter(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Theme', submenu: themeSubmenu },
        { type: 'separator' },
        { label: 'UI Scale', submenu: uiScaleSubmenu },
        { type: 'separator' },
        { label: 'Editor Text Size', submenu: editorFontSubmenu },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            // Placeholder — open docs URL
            sendMenuAction(window, 'open-documentation');
          },
        },
        { type: 'separator' },
        {
          label: 'About Plotline',
          click: () => {
            dialog.showMessageBox(window, {
              type: 'info',
              title: 'About Plotline',
              message: 'Plotline',
              detail: `Version ${app.getVersion()}\nDistraction-free writing for Substack.`,
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
