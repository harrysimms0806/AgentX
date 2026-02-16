/**
 * AgentX Electron Main (Simplified)
 * 
 * Serves built frontend files directly - no dev server needed
 */

const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Keep global references
let mainWindow;
let tray;
let backendProcess;

// Determine paths
const APP_DIR = __dirname;
const isStandalone = process.env.AGENTX_STANDALONE === '1';

function getNodePath() {
  return isStandalone 
    ? path.join(APP_DIR, 'node', 'bin', 'node')
    : process.execPath;
}

function getNpmPath() {
  return isStandalone
    ? path.join(APP_DIR, 'node', 'bin', 'npm')
    : 'npm';
}

// Wait for backend to be ready
function waitForBackend(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const check = () => {
      attempts++;
      const req = http.get('http://localhost:3001/api/health', (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Backend ready');
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
      
      req.setTimeout(1000, () => {
        req.abort();
        retry();
      });
      
      function retry() {
        if (attempts >= maxAttempts) {
          reject(new Error('Backend startup timeout'));
        } else {
          setTimeout(check, 1000);
        }
      }
    };
    
    check();
  });
}

// Start backend server
async function startBackend() {
  const nodePath = getNodePath();
  
  console.log('🔧 Starting backend...');
  console.log('   Node:', nodePath);
  
  return new Promise((resolve, reject) => {
    backendProcess = spawn(nodePath, ['backend/server.js'], {
      cwd: APP_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        AGENTX_STANDALONE: '1',
      },
      stdio: 'pipe',
    });

    let hasError = false;

    backendProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      console.log('[Backend]', msg);
    });

    backendProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      console.error('[Backend]', msg);
    });

    backendProcess.on('error', (err) => {
      hasError = true;
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      if (code !== 0 && !hasError) {
        console.error(`Backend exited with code ${code}`);
      }
    });

    // Give backend a moment to start, then wait for health check
    setTimeout(async () => {
      try {
        await waitForBackend();
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 2000);
  });
}

// Create main window
async function createWindow() {
  console.log('🪟 Creating window...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });

  // Load from local dev server
  const dashboardUrl = 'http://localhost:5173';
  console.log('🌐 Loading:', dashboardUrl);
  
  // Show loading screen first
  mainWindow.loadURL('data:text/html,<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;"><div>Loading AgentX...</div></body></html>');
  mainWindow.show();
  
  // Try to load the actual dashboard
  let attempts = 0;
  const maxAttempts = 30;
  
  const tryLoad = async () => {
    attempts++;
    try {
      await mainWindow.loadURL(dashboardUrl);
      console.log('✅ Dashboard loaded');
    } catch (err) {
      if (attempts < maxAttempts) {
        console.log(`⏳ Retry ${attempts}/${maxAttempts}...`);
        setTimeout(tryLoad, 1000);
      } else {
        console.error('❌ Failed to load dashboard:', err.message);
        mainWindow.loadURL(`data:text/html,<h1>Error</h1><p>Could not connect to AgentX server</p><p>${err.message}</p><p>Check logs: ~/Library/Logs/AgentX/</p>`);
      }
    }
  };
  
  setTimeout(tryLoad, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray();
}

// Create system tray
function createTray() {
  try {
    // Create a simple 16x16 icon
    const iconPath = path.join(__dirname, 'macOS', 'AgentX.app', 'Contents', 'Resources', 'AppIcon.png');
    let trayIcon;
    
    try {
      trayIcon = nativeImage.createFromPath(iconPath);
      if (trayIcon.isEmpty()) {
        throw new Error('Empty icon');
      }
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } catch {
      // Create a blank icon as fallback
      trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('AgentX');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Dashboard', click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }},
      { type: 'separator' },
      { label: 'Open in Browser', click: () => {
        require('electron').shell.openExternal('http://localhost:5173');
      }},
      { type: 'separator' },
      { label: 'Quit', click: () => {
        app.quit();
      }},
    ]);

    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.error('Tray error:', err);
  }
}

// App initialization
app.whenReady().then(async () => {
  console.log('\n🚀 AgentX Electron Starting...\n');

  try {
    // Start backend
    await startBackend();
    
    // Create window
    await createWindow();
    
    console.log('\n✨ AgentX is ready!\n');
    
  } catch (err) {
    console.error('\n💥 Startup error:', err);
    
    // Show error window
    mainWindow = new BrowserWindow({
      width: 600,
      height: 400,
      title: 'AgentX Error',
    });
    
    mainWindow.loadURL(`data:text/html,<h1>Startup Error</h1><pre>${err.stack || err.message}</pre>`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit handler
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('\n🛑 Shutting down...');
  
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
  }
});

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
