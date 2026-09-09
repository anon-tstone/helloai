/**
 * Flipbook Studio desktop shell.
 *
 * Wraps an exported offline flipbook in an Electron window so it can ship as a
 * double-click application. The book is plain, self-contained HTML — this file
 * only supplies the window, the menu and the security boundary around it.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const CONTENT = path.join(__dirname, 'content', 'index.html')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 420,
    backgroundColor: '#14151b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // The book is static HTML and needs none of Node, so keep it walled off.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Links inside the book open in the user's browser, never as app windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  if (!fs.existsSync(CONTENT)) {
    dialog.showErrorBox(
      'Flipbook missing',
      `No book was bundled with this app.\n\nExpected: ${CONTENT}`,
    )
    app.quit()
    return
  }

  win.loadFile(CONTENT)
  return win
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: (_item, win) => win && win.webContents.print(),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'reload' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
