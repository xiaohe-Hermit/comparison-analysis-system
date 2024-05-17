const {app, BrowserWindow, dialog, ipcMain, globalShortcut} = require('electron');
const path = require("path");

// 只在开发环境下启用热重载
// if (process.env.NODE_ENV !== 'production') {
//     require('electron-reloader')(module);
// }

function createWindow() {
	const desktopPath = app.getPath('desktop')
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        resizable: false, // 禁止窗口大小调整
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true, // 保持为 true 以增加安全性
            preload: path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true, // 自动隐藏菜单栏
        frame: true
    })

    mainWindow.loadFile('renderer/index.html');
    // 设置全局变量
    mainWindow.webContents.on('did-finish-load', () => {
	  mainWindow.webContents.executeJavaScript(`
		window.localStorage.setItem('__desktop_path',  '${desktopPath}')
	 `);
    });
    mainWindow.setMaximizable(false);

}

app.whenReady().then(() => {
    createWindow();
    // 注册快捷键打开DevTools
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        BrowserWindow.getFocusedWindow().webContents.openDevTools()
    });
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    });

})

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
})
// 关闭窗口
ipcMain.on('close-window-request', (event) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
        focusedWindow.close();
    }
});
// 弹出确认退出框
ipcMain.handle('confirm-action', async () => {
    const {response} = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'question',
        buttons: ['确定', '取消'],
        title: '操作确认',
        message: '您确定要退出当前应用吗？'
    });
    return response === 0; // 返回true表示用户点击了确定
});
