const retryBtn = document.getElementById("retry-btn");
const focusBtn = document.getElementById("focus-btn");
const dashboardUrl = "https://synapse24.netlify.app";

function ignoreRuntimeError() {
  void chrome.runtime.lastError;
}

retryBtn.addEventListener("click", () => {
  chrome.tabs.update({ url: dashboardUrl }, ignoreRuntimeError);
});

focusBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "RETURN_TO_FOCUS" }, ignoreRuntimeError);
});
