'use strict';

const electron      = require('electron');
const app           = electron.app;  // Module to control application life.
const BrowserWindow = electron.BrowserWindow;  // Module to create native browser window.
const util          = require('util');
const fork          = require('child_process').fork;
const ipc           = require("electron").ipcMain;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow      = null;
var settingsWindow     = null;

var snifferjsProc   = null; // child fork handler

// First window should be settings window
function showSettings() {
    settingsWindow = new BrowserWindow({
        width: 800, height: 600, frame: false, titleBarStyle: 'hidden'
        });
    settingsWindow.loadURL('file://' + __dirname + '/electron.html');
    // settingsWindow.webContents.openDevTools();
}

function showMain () {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        nodeIntegration: true,
        width: 800, height: 600, show: false,
        title: 'sniffer.js',
        frame: true, //no removes all borders
        });
    mainWindow.setMenu(null);

    // and load the index.html of the app.
    //mainWindow.loadURL('file://' + __dirname + '/index.html');
    setTimeout(function(){
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.show();
        settingsWindow.close();

    }, 2000);


    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', function() {
      mainWindow = null;
      if (snifferjsProc !== null)
        snifferjsProc.kill('SIGINT');
    });


}

ipc.on('settings-change', function(e, arg) {
    console.log('settings changed', arg);
    if (snifferjsProc !== null)
        snifferjsProc.kill('SIGINT');
    setTimeout(function(){
        snifferjsProc = fork(__dirname+'/sniffer.js', [arg.eth, arg.filter, arg.gateway]);
        if (mainWindow == null) {
            setTimeout(showMain, 1000);
        }
    }, 1000);
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform != 'darwin') {
    app.quit();
  }
});


//var util = require('util');
// util.log('log message');
// util.log(util.inspect({'test': 'test'}));
// console.log(__filename);
// console.log(__dirname);



// process.inited = true;
// var childProcess = snifferjsProc(__dirname+'/sniffer.js', ['wlan0', 'ip', '192.168.100.1']);



// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {

  console.log('ready');
  showSettings();


});
