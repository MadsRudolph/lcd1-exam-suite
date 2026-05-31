/**
 * main.js
 * Electron main process script defining the standalone desktop window lifecycle.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 600,
        backgroundColor: '#090d16', // Slate dark theme color
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: "LCD1 Reducer — Desktop Offline App"
    });

    // Remove top menu bar for a sleek native desktop app layout
    mainWindow.removeMenu();

    // Load local bundled index.html
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC main handler for Check for Updates
ipcMain.on('check-update', (event) => {
    event.reply('update-status', { status: 'checking', message: 'Checking GitHub for updates...' });
    
    // Execute git pull in the background
    exec('git pull', { cwd: __dirname }, (err, stdout, stderr) => {
        if (err) {
            event.reply('update-status', { status: 'error', message: 'Git pull failed: ' + err.message });
            return;
        }

        // Check if there are no new commits
        if (stdout.includes('Already up to date.') || stdout.includes('Already up-to-date.')) {
            event.reply('update-status', { status: 'up-to-date', message: 'App is already up to date!' });
            return;
        }

        // Updates were pulled, execute esbuild compiler bundle
        event.reply('update-status', { status: 'updating', message: 'New updates downloaded! Rebuilding bundle...' });
        
        exec('npm run build', { cwd: __dirname }, (buildErr, buildStdout, buildStderr) => {
            if (buildErr) {
                event.reply('update-status', { status: 'error', message: 'Rebuild failed: ' + buildErr.message });
                return;
            }

            event.reply('update-status', { status: 'success', message: 'Rebuild complete! Restarting...' });
            
            // Reload focused window to apply the compiled changes
            setTimeout(() => {
                const win = BrowserWindow.getFocusedWindow();
                if (win) {
                    win.reload();
                }
            }, 1500);
        });
    });
});

