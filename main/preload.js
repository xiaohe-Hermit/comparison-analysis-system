const {contextBridge, ipcRenderer} = require('electron');
const {start_Scrape, download_outcome} = require("../renderer/analysis");

contextBridge.exposeInMainWorld('closeWindow', {
    closeCurrentWindow: () => ipcRenderer.send('close-window-request'),
});
contextBridge.exposeInMainWorld('confirmQuit', {
    confirmAction: () => ipcRenderer.invoke('confirm-action'),
});
contextBridge.exposeInMainWorld('analysis', {
    start_Scrape: (url, start, end, keywords) => {
        start_Scrape(url, start, end, keywords).then(res => {
            localStorage.setItem('analysis-result', JSON.stringify(res));
            analysis_ready();
        });
    },
    download_outcome: () => {
        let analysisResult = localStorage.getItem('analysis-result');
        let data = JSON.parse(analysisResult);
        download_outcome(data).then(res => {
            if (res) {
                download_ready(true);
            } else {
                download_ready(false);
            }
        });
    },
});
function analysis_ready() {
    const btn = document.getElementById("analysis-finish-btn");
    const body = document.getElementById("analysis-finish-body");
    const exit = document.getElementById("analysis-exit-btn");
    exit.style.display = "none";
    body.innerHTML = "分析完毕！";
    btn.innerHTML = "完成分析";
    btn.disabled = false;
}
function download_ready(flag) {
    const btn = document.getElementById("download-finish-btn");
    const body = document.getElementById("download-finish-body");
    const exit = document.getElementById("download-exit-btn");
    exit.style.display = "none";
    btn.disabled = false;
    if (flag){
        body.innerHTML = "下载完毕！结果位于桌面";
        btn.innerHTML = "完成下载";
    }else {
        body.innerHTML = "下载失败！";
        btn.innerHTML = "退出下载";
    }

}
