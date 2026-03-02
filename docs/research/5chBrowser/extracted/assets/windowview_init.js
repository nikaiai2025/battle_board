const { ipcRenderer, webFrame, BrowserWindow } = require('electron')

ipcRenderer.on('did-finish-load', (event, args) => {
  window.open(args)
})
