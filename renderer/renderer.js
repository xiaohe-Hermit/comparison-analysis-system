const urlShow = document.querySelector("#url-show");
const keywordShow = document.querySelector("#keyword-show");
const dateShow = document.querySelector("#date-show");
const urlSetting = document.querySelector("#url-setting");
const keywordSetting = document.querySelector("#keyword-setting");
const dateStartSetting = document.querySelector("#date-start-setting");
const dateEndSetting = document.querySelector("#date-end-setting");
const url_invalid = document.getElementById("validationServerUrlFeedback");
const date_invalid = document.getElementById("validationServerDateFeedback");

function init() {
    urlSetting.value = "http://www.czxqcourt.gov.cn/list/18/_1";
    keywordSetting.value = "诉求,判令,诉讼费用,送达方式";
    dateStartSetting.value = "2022-06";
    dateEndSetting.value = "2023-06";
    updateSetting();
    localStorage.clear();
    checkLocalStorage();
    // 给进入设置按钮绑定事件
    document.querySelector("#setting-open-window").addEventListener("click",function () {
        urlSetting.classList.remove('is-valid', 'is-invalid');
        dateStartSetting.classList.remove('is-valid', 'is-invalid');
        dateEndSetting.classList.remove('is-valid', 'is-invalid');
        url_invalid.style.display = "none";
        date_invalid.style.display = "none";
    })
    // 给保存设置按钮绑定事件
    document.querySelector("#save-setting-btn").addEventListener("click", function () {
        const check = checkSetting();
        if (check.length === 0) {
            updateSetting();
            urlSetting.classList.remove('is-valid', 'is-invalid');
            dateStartSetting.classList.remove('is-valid', 'is-invalid');
            url_invalid.style.display = "none";
            date_invalid.style.display = "none";
        } else {
            for (let i = 0; i < check.length; i++) {
                if (check[i] === "url") {
                    urlSetting.classList.remove('is-valid', 'is-invalid');
                    urlSetting.classList.add("is-invalid");
                    url_invalid.style.display = "block";
                } else if (check[i] === "date") {
                    dateStartSetting.classList.remove('is-valid', 'is-invalid');
                    dateStartSetting.classList.add('is-invalid');
                    dateEndSetting.classList.remove('is-valid', 'is-invalid');
                    dateEndSetting.classList.add('is-invalid');
                    date_invalid.style.display = "block";
                }
            }
        }
    })
    // 给退出按钮绑定退出时间
    document.querySelector("#exit").addEventListener("click", async function (event) {
        event.preventDefault();
        const isConfirmed = await window.confirmQuit.confirmAction();
        if (isConfirmed) {
            localStorage.clear();
            window.closeWindow.closeCurrentWindow();
        } else {
            console.log('用户点击了取消');
        }
    });
    // 给分析按钮绑定事件
    document.querySelector("#analysis-open-window").addEventListener("click", function () {
        const urlCheck = document.getElementById("url-check");
        const keywordCheck = document.getElementById("keyword-check");
        const dateCheck = document.getElementById("date-check");
        urlCheck.innerText = urlShow.value;
        keywordCheck.innerText = keywordShow.value;
        dateCheck.innerText = dateShow.value;
    })
    //给开始分析按钮绑定事件
    document.querySelector("#analysis-btn").addEventListener("click", async function () {
        checkLocalStorage();
        localStorage.removeItem('analysis-result');
        const url = urlShow.value;
        const start = dateShow.value.split("到")[0].replace("-", "年") + "月";
        const end = dateShow.value.split("到")[1].replace("-", "年") + "月";
        const keywords = keywordShow.value.replace("，", ",").split(",");
        window.analysis.start_Scrape(url, start, end, keywords);
        hide_current_Modal("analysisModal");
    });
    // 给完成分析按钮绑定事件
    document.querySelector("#analysis-finish-btn").addEventListener("click", function () {
        hide_current_Modal("analysisModal2")
        reset_analysisModal();
        if (checkLocalStorage()) {
            showToast("analysisToast", true);
        } else {
            showToast("analysisToast", false);
        }
    })
    //给开始下载按钮绑定事件
    document.querySelector("#download-btn").addEventListener("click", async function () {
        window.analysis.download_outcome();
        hide_current_Modal("downloadModal")
    });
    // 给下载分析按钮绑定事件
    document.querySelector("#download-finish-btn").addEventListener("click", function () {
        hide_current_Modal("downloadModal2");
        reset_downloadModal();
        checkLocalStorage();
    })
}

/**
 * 弹出指定toast框
 * @param toastId
 */
function showToast(toastId, flag) {
    const current_toastLive = document.getElementById(toastId);
    const toast = new bootstrap.Toast(current_toastLive);
    if (toastId === "analysisToast") {
        const bodyMsg = document.querySelector("#analysisToast .toast-body");
        flag ? bodyMsg.textContent = "分析完成，结果已存储在本地，可以开始下载" : bodyMsg.textContent = "分析完成，并未发现疑似违法的信息，无法下载";
    }
    toast.show()
    // 设置Toast在5秒后自动消失
    setTimeout(function () {
        toast.hide();
    }, 5000);
}

/**
 * 关闭当前弹窗
 * @param elementId 当前弹窗id
 */
function hide_current_Modal(elementId) {
    const currentModal = document.getElementById(elementId);
    const bsModal = bootstrap.Modal.getInstance(currentModal);
    if (bsModal) {
        bsModal.hide();
    }
}

/**
 * 重置开始分析页面
 */
function reset_analysisModal() {
    const btn = document.getElementById("analysis-finish-btn");
    const body = document.getElementById("analysis-finish-body");
    const exit = document.getElementById("analysis-exit-btn");
    exit.style.display = "flex";
    body.innerHTML = "<p>联网分析中，可能花费较长时间，请耐心等待(大致为:每分析1年，耗时3分钟)</p>\n" +
        "                                <div class=\"d-flex justify-content-center\">\n" +
        "                                    <div class=\"spinner-border\" role=\"status\">\n" +
        "                                        <span class=\"visually-hidden\">Loading...</span>\n" +
        "                                    </div>\n" +
        "                                </div>";
    btn.innerHTML = "<span class=\"spinner-border spinner-border-sm\" role=\"status\" aria-hidden=\"true\"></span>\n" +
        "                                    分析中...";
    btn.disabled = "disabled";
}

/**
 * 重置开始下载页面
 */
function reset_downloadModal() {
    const btn = document.getElementById("download-finish-btn");
    const body = document.getElementById("download-finish-body");
    const exit = document.getElementById("download-exit-btn");
    exit.style.display = "flex";
    body.innerHTML = "<p>下载中，请耐心等待</p>\n" +
        "                                <div class=\"d-flex justify-content-center\">\n" +
        "                                    <div class=\"spinner-border\" role=\"status\">\n" +
        "                                        <span class=\"visually-hidden\">Loading...</span>\n" +
        "                                    </div>\n" +
        "                                </div>";
    btn.innerHTML = "<span class=\"spinner-border spinner-border-sm\" role=\"status\" aria-hidden=\"true\"></span>\n" +
        "                                    下载中...";
    btn.disabled = "disabled";
}

/**
 * 检查本地存储中是否有分析结果
 * @returns {boolean}
 */
function checkLocalStorage() {
    const downloadBtn = document.querySelector("#download-open-window");
    const analysis_result = localStorage.getItem('analysis-result');
    if (analysis_result) {
        const data = JSON.parse(analysis_result);
        if (data != null && data.length > 0) {
            downloadBtn.disabled = false;
            return true;
        }
    } else {
        downloadBtn.disabled = "disabled";
    }
    return false;
}

/**
 * 更新分析设置
 */
function updateSetting() {
    urlShow.value = urlSetting.value;
    keywordShow.value = keywordSetting.value;
    dateShow.value = dateStartSetting.value + "到" + dateEndSetting.value;
    const settingModal = document.getElementById('settingModal');
    const bsModal = bootstrap.Modal.getInstance(settingModal);
    if (bsModal) {
        bsModal.hide();
    }
}

/**
 * 检查参数设置是否有问题
 * @returns {*[]} 返回问题数组
 */
function checkSetting() {
    const result = [];
    const urlCheck = urlSetting.value.startsWith("http://") || urlSetting.value.startsWith("https://");
    const start = dateStartSetting.value.split("-");
    const end = dateEndSetting.value.split("-");
    const dateCheck = (start[0] < end[0]) || (start[0] === end[0] && start[1] < end[1]);
    if (urlCheck && dateCheck) {
        return result;
    }
    if (!urlCheck) {
        result.push("url");
    }
    if (!dateCheck) {
        result.push("date");
    }
    return result;
}

/**
 * 切换页面
 * @param pageId
 */
function changeContent(pageId) {
    // 隐藏所有内容区域
    document.querySelectorAll('#contentArea > div').forEach(function (div) {
        div.style.display = 'none';
    });

    // 显示对应的内容区域
    document.getElementById(pageId).style.display = 'block';
}

init();
