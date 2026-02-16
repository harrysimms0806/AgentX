/**
 * Electron Preload Script
 * Secure bridge between main and renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the web app
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // App info
  version: '1.1.0',
  
  // Check if running in Electron
  isElectron: true,
});
