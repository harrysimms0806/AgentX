/**
 * AgentX Electron Main - Fixed Version
 */

const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;
let tray;

function createWindow() {
  console.log('Creating window...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load loading screen first
  mainWindow.loadURL('data:text/html,<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:-apple-system,sans-serif;background:#f5f5f7;"><div style="text-align:center;"><h1 style="font-size:48px;margin:0;">🤖</h1><p style="color:#666;">Loading AgentX...</p></div></body></html>');
  
  // Wait for server with retries
  let attempts = 0;
  const maxAttempts = 60;
  
  const checkServer = () => {
    attempts++;
    console.log(`Checking server (${attempts}/${maxAttempts})...`);
    
    if (!mainWindow) {
      console.log('Window was closed, aborting');
      return;
    }
    
    const req = http.get('http://localhost:5173', (res) => {
      console.log('Server responded:', res.statusCode);
      if (res.statusCode === 200 || res.statusCode === 304) {
        if (mainWindow) {
          mainWindow.loadURL('http://localhost:5173');
          console.log('Dashboard loaded!');
        }
      } else {
        retry();
      }
    }).on('error', (err) => {
      console.log('Server not ready:', err.message);
      retry();
    });
    
    req.setTimeout(3000, () => {
      req.abort();
      retry();
    });
    
    function retry() {
      if (!mainWindow) return;
      if (attempts < maxAttempts) {
        setTimeout(checkServer, 1000);
      } else {
        console.error('Timeout');
        mainWindow.loadURL('data:text/html,<h1>Error</h1><p>Could not connect. Check logs.</p>');
      }
    }
  };
  
  setTimeout(checkServer, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.log('Electron ready');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Prevent new windows
app.on('web-contents-created', (e, contents) => {
  contents.on('new-window', (e, url) => {
    e.preventDefault();
    require('electron').shell.openExternal(url);
  });
});
