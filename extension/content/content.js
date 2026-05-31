let isLocked = false;
let currentSession = null;
let layerEl = null;
let toastTimeout = null;
let centerNoticeEl = null;
let fullscreenWarningCount = 0;
let ytNavigationObserver = null;
let ytAdObserver = null;
let ytAdSkipInterval = null;
let lockedVideoId = null;
let blurViolationCooldown = 0;
let videoPauseTimeout = null;
let pauseAlertInterval = null;
let pauseReminderShown = false;
let dashboardConnected = false;
let lastKeyboardWarningAt = 0;
let lastAdSkipAt = 0;
let benignStudyControlUntil = 0;
let extensionContextAlive = true;
let synapseAiStatus = null;
let synapseAiWidgetEl = null;
let synapseAiPanelEl = null;
let synapseAiMessagesEl = null;
let synapseAiInputEl = null;
let synapseAiInFlight = false;
let synapseAiPanelOpen = false;
let synapseAiDragState = null;
let synapseAiSpeechRecognition = null;
let synapseAiInactivityTimer = null;
let lastSynapseAiInteractionAt = 0;

function hasRuntime() {
  try {
    return (
      extensionContextAlive &&
      typeof chrome !== "undefined" &&
      Boolean(chrome.runtime?.id)
    );
  } catch (_) {
    extensionContextAlive = false;
    return false;
  }
}

function safeRuntimeGetURL(path) {
  if (!hasRuntime()) return "";

  try {
    return chrome.runtime.getURL(path);
  } catch (_) {
    extensionContextAlive = false;
    return "";
  }
}

const focusLockIconUrl = safeRuntimeGetURL("assets/icon128.png");
const synapseIconUrl = safeRuntimeGetURL("assets/synapse-icon-transparent.png") || focusLockIconUrl;

const platformLabel = (() => {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const lower = platform.toLowerCase();
  if (lower.includes("win")) return "Windows";
  if (lower.includes("linux") || lower.includes("x11")) return "Linux";
  if (lower.includes("mac")) return "macOS";
  return "desktop";
})();

const interruptionMessages = [
  "Stay focused.",
  "Your goals need consistency.",
  "Two hours of focus can change your future.",
  "Come back to your session.",
  "Keep the promise you made to yourself.",
  "This block matters. Stay with it."
];

const milestoneMessages = [
  "Thirty minutes done. Keep the rhythm.",
  "You stayed with it. That is real progress.",
  "Another focus block is compounding.",
  "Strong work. Stay in the quiet lane.",
  "Momentum is on your side."
];

const reasonMessages = {
  "tab-switch": "Tab switch blocked. Stay on your study tab.",
  "window-switch": "Window switch blocked. Stay in this study window.",
  "new-tab": "New tab blocked. Keep your focus where it belongs.",
  "blocked-site": "Distraction blocked. Back to your session.",
  "video-change": "Video change blocked. Finish your current lesson first.",
  "keyboard-shortcut": "Shortcut blocked. Focus Lock is still on.",
  "fullscreen-exit": "Fullscreen exit detected. Returning you to focus.",
  "switch-burst": "Too many switches. Take one breath and return.",
  "tab-close": "Focus tab restored. Finish the session before closing it.",
  "new-window": "New window blocked. Stay in your focus space.",
  "miniplayer": "Mini-player blocked. Finish the lesson in focus mode."
};

function ignoreRuntimeError() {
  try {
    const message = chrome.runtime.lastError?.message || "";
    if (message.toLowerCase().includes("context invalidated")) {
      extensionContextAlive = false;
    }
  } catch (_) {
    extensionContextAlive = false;
  }
}

function safeRuntimeSendMessage(message, callback = ignoreRuntimeError) {
  if (!hasRuntime()) return false;

  try {
    chrome.runtime.sendMessage(message, (response) => {
      try {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          if ((runtimeError.message || "").toLowerCase().includes("context invalidated")) {
            extensionContextAlive = false;
          }
          return;
        }
      } catch (_) {
        extensionContextAlive = false;
        return;
      }

      if (callback) callback(response);
    });
    return true;
  } catch (_) {
    extensionContextAlive = false;
    return false;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function whenBodyReady(callback) {
  if (document.body) {
    callback();
    return;
  }

  document.addEventListener("DOMContentLoaded", callback, { once: true });
}

function ensureBaseStyles() {
  if (document.getElementById("synapse-focus-styles")) return;

  const style = document.createElement("style");
  style.id = "synapse-focus-styles";
  style.textContent = `
    @keyframes synapseFocusToastIn {
      from { opacity: 0; transform: translate(-50%, -14px) scale(0.98); }
      to { opacity: 1; transform: translate(-50%, 0) scale(1); }
    }

    @keyframes synapseFocusNoticeIn {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes synapseFocusDot {
      0% { box-shadow: 0 0 0 0 rgba(255, 0, 184, 0.35); }
      70% { box-shadow: 0 0 0 9px rgba(255, 0, 184, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 0, 184, 0); }
    }

    @keyframes synapseAiFloatIn {
      from { opacity: 0; transform: translateY(-8px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes synapseAiPanelIn {
      from { opacity: 0; transform: translateX(18px) scale(0.98); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }

    @keyframes synapseAiGlow {
      0%, 100% { box-shadow: 0 14px 44px rgba(255, 0, 184, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16); }
      50% { box-shadow: 0 18px 58px rgba(255, 0, 184, 0.34), 0 0 0 7px rgba(255, 0, 184, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.2); }
    }

    .synapse-focus-toast {
      position: fixed;
      top: 18px;
      left: 50%;
      z-index: 2147483647;
      width: min(520px, calc(100vw - 28px));
      border: 1px solid rgba(255, 255, 255, 0.13);
      border-radius: 18px;
      background:
        linear-gradient(135deg, rgba(255, 0, 184, 0.18), rgba(75, 0, 130, 0.32)),
        rgba(13, 13, 16, 0.86);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 13px 15px;
      font: 600 13px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(22px) saturate(1.1);
      animation: synapseFocusToastIn 180ms ease both;
      pointer-events: none;
    }

    .synapse-focus-toast small {
      color: rgba(255, 255, 255, 0.62);
      font-size: 11px;
      white-space: nowrap;
    }

    .synapse-focus-notice-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      padding: 22px;
      background:
        radial-gradient(circle at 50% 8%, rgba(255, 0, 184, 0.2), transparent 34%),
        rgba(4, 4, 7, 0.72);
      backdrop-filter: none;
    }

    .synapse-focus-notice {
      width: min(460px, 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 24px;
      background:
        linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
        linear-gradient(135deg, rgba(75, 0, 130, 0.34), rgba(255, 0, 184, 0.16)),
        rgba(13, 13, 16, 0.9);
      box-shadow: 0 30px 110px rgba(0, 0, 0, 0.55);
      padding: 28px;
      color: #fff;
      text-align: center;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      animation: synapseFocusNoticeIn 220ms ease both;
    }

    .synapse-focus-mark {
      display: grid;
      width: 46px;
      height: 46px;
      margin: 0 auto 16px;
      place-items: center;
      border-radius: 14px;
      background: linear-gradient(135deg, #4b0082, #ff00b8);
      box-shadow: 0 18px 46px rgba(255, 0, 184, 0.24);
      color: #fff;
      font-weight: 800;
      letter-spacing: 0;
      overflow: hidden;
    }

    .synapse-focus-mark img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .synapse-focus-notice h2 {
      margin: 0;
      color: #fff;
      font-size: 22px;
      line-height: 1.18;
      letter-spacing: 0;
    }

    .synapse-focus-notice p {
      margin: 12px 0 0;
      color: rgba(255, 255, 255, 0.72);
      font-size: 13px;
      line-height: 1.6;
    }

    .synapse-focus-badge {
      position: fixed;
      right: 14px;
      bottom: 54px;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      background: rgba(13, 13, 16, 0.72);
      color: rgba(255, 255, 255, 0.86);
      padding: 7px 10px;
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(18px);
      font: 700 11px/1 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
      user-select: none;
    }

    .synapse-focus-badge i {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #ff00b8;
      animation: synapseFocusDot 1.9s infinite;
    }

    .synapse-ai-widget,
    .synapse-ai-panel {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    .synapse-ai-widget {
      position: fixed;
      z-index: 2147483645;
      width: 46px;
      height: 46px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 15px;
      background:
        linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.04)),
        rgba(13, 13, 16, 0.66);
      box-shadow: 0 14px 44px rgba(255, 0, 184, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(18px) saturate(1.16);
      -webkit-backdrop-filter: blur(18px) saturate(1.16);
      cursor: grab;
      display: grid;
      place-items: center;
      padding: 0;
      overflow: hidden;
      user-select: none;
      animation: synapseAiFloatIn 220ms ease both, synapseAiGlow 4.2s ease-in-out infinite;
      transition: transform 180ms ease, border-color 180ms ease, opacity 180ms ease;
    }

    .synapse-ai-widget:hover,
    .synapse-ai-widget.is-open {
      border-color: rgba(255, 0, 184, 0.48);
      transform: scale(1.06);
    }

    .synapse-ai-widget.is-dragging {
      cursor: grabbing;
      transform: scale(1.03);
      transition: none;
    }

    .synapse-ai-widget img {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      object-fit: cover;
      pointer-events: none;
    }

    .synapse-ai-panel {
      position: fixed;
      z-index: 2147483644;
      display: none;
      width: min(340px, calc(100vw - 24px));
      height: min(590px, calc(100vh - 28px));
      grid-template-rows: auto minmax(0, 1fr) auto;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      background:
        linear-gradient(145deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.018)),
        rgba(13, 13, 18, 0.92);
      box-shadow: 0 28px 96px rgba(0, 0, 0, 0.48), 0 0 44px rgba(255, 0, 184, 0.12);
      overflow: hidden;
      backdrop-filter: blur(26px) saturate(1.1);
      -webkit-backdrop-filter: blur(26px) saturate(1.1);
      animation: synapseAiPanelIn 210ms ease both;
    }

    .synapse-ai-panel.is-open {
      display: grid;
    }

    .synapse-ai-header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 66px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 12px 14px;
      background:
        linear-gradient(135deg, rgba(255, 0, 184, 0.08), rgba(90, 70, 255, 0.035)),
        rgba(255, 255, 255, 0.035);
    }

    .synapse-ai-header img {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      object-fit: cover;
    }

    .synapse-ai-title {
      display: grid;
      min-width: 0;
      gap: 2px;
      flex: 1;
    }

    .synapse-ai-title strong {
      color: #ffffff;
      font-size: 14px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .synapse-ai-title span {
      display: flex;
      align-items: center;
      gap: 6px;
      color: rgba(255, 255, 255, 0.62);
      font-size: 11px;
      line-height: 1.2;
    }

    .synapse-ai-title span::before {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #9cff58;
      box-shadow: 0 0 12px rgba(156, 255, 88, 0.45);
      content: "";
    }

    .synapse-ai-close {
      display: grid;
      width: 30px;
      height: 30px;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.72);
      cursor: pointer;
      font: 800 18px/1 Inter, sans-serif;
    }

    .synapse-ai-messages {
      display: flex;
      min-height: 0;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
      padding: 14px;
      scroll-behavior: smooth;
    }

    .synapse-ai-messages::-webkit-scrollbar {
      width: 8px;
    }

    .synapse-ai-messages::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
    }

    .synapse-ai-message {
      max-width: 94%;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 11px 12px;
      color: rgba(255, 255, 255, 0.84);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.58;
      overflow-wrap: anywhere;
    }

    .synapse-ai-message.user {
      align-self: flex-end;
      border-color: rgba(255, 0, 184, 0.38);
      background: linear-gradient(135deg, rgba(75, 0, 130, 0.6), rgba(255, 0, 184, 0.22));
      color: #ffffff;
    }

    .synapse-ai-message.assistant,
    .synapse-ai-message.system {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.05);
    }

    .synapse-ai-message.system {
      max-width: 100%;
      color: rgba(255, 255, 255, 0.62);
      font-size: 12px;
      font-weight: 600;
    }

    .synapse-ai-message h1,
    .synapse-ai-message h2,
    .synapse-ai-message h3,
    .synapse-ai-message p,
    .synapse-ai-message ul,
    .synapse-ai-message ol,
    .synapse-ai-message pre {
      margin: 0;
    }

    .synapse-ai-message h1,
    .synapse-ai-message h2,
    .synapse-ai-message h3 {
      margin-top: 4px;
      color: #ffffff;
      font-size: 14px;
      font-weight: 850;
      line-height: 1.3;
    }

    .synapse-ai-message p + p,
    .synapse-ai-message p + ul,
    .synapse-ai-message p + ol,
    .synapse-ai-message ul + p,
    .synapse-ai-message ol + p {
      margin-top: 8px;
    }

    .synapse-ai-message ul,
    .synapse-ai-message ol {
      display: grid;
      gap: 6px;
      padding-left: 18px;
    }

    .synapse-ai-message code {
      border-radius: 5px;
      background: rgba(0, 0, 0, 0.34);
      padding: 2px 5px;
      color: #f7d9ff;
      font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 11.5px;
    }

    .synapse-ai-message pre {
      margin-top: 8px;
      overflow-x: auto;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.46);
      padding: 10px;
    }

    .synapse-ai-message pre code {
      display: block;
      background: transparent;
      padding: 0;
      white-space: pre;
    }

    .synapse-ai-composer {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 46px;
      align-items: end;
      gap: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding: 12px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(0, 0, 0, 0.24)),
        rgba(0, 0, 0, 0.18);
    }

    .synapse-ai-composer textarea {
      min-height: 46px;
      max-height: 110px;
      resize: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      outline: none;
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      padding: 13px 12px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
      font: 600 13px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .synapse-ai-composer textarea::placeholder {
      color: rgba(255, 255, 255, 0.42);
    }

    .synapse-ai-icon-button {
      display: grid;
      width: 42px;
      height: 46px;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.11);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.065);
      color: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      font: 850 14px/1 Inter, sans-serif;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }

    .synapse-ai-icon-button:hover {
      border-color: rgba(255, 0, 184, 0.36);
      background: rgba(255, 0, 184, 0.13);
      transform: translateY(-1px);
    }

    .synapse-ai-icon-button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
      transform: none;
    }

    .synapse-ai-mic {
      border-color: rgba(255, 255, 255, 0.16);
      background:
        linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.025)),
        rgba(14, 13, 22, 0.86);
      box-shadow: 0 0 24px rgba(255, 0, 184, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    .synapse-ai-send {
      width: 46px;
      height: 46px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(135deg, #ff35c8, #7d34ff);
      color: #ffffff;
      box-shadow: 0 14px 36px rgba(255, 0, 184, 0.34);
    }

    .synapse-ai-send:hover {
      background: linear-gradient(135deg, #ff43d0, #8b45ff);
      box-shadow: 0 18px 46px rgba(255, 0, 184, 0.42);
    }

    .synapse-ai-mic-icon {
      position: relative;
      width: 10px;
      height: 15px;
      border: 2px solid currentColor;
      border-radius: 999px;
    }

    .synapse-ai-mic-icon::before {
      position: absolute;
      left: 50%;
      bottom: -8px;
      width: 14px;
      height: 8px;
      border: 2px solid currentColor;
      border-top: 0;
      border-radius: 0 0 999px 999px;
      content: "";
      transform: translateX(-50%);
    }

    .synapse-ai-mic-icon::after {
      position: absolute;
      left: 50%;
      bottom: -12px;
      width: 2px;
      height: 6px;
      border-radius: 999px;
      background: currentColor;
      content: "";
      transform: translateX(-50%);
    }

    .synapse-ai-send-icon {
      position: relative;
      width: 15px;
      height: 15px;
    }

    .synapse-ai-send-icon::before {
      position: absolute;
      inset: 3px 3px auto auto;
      width: 8px;
      height: 8px;
      border-top: 2px solid currentColor;
      border-right: 2px solid currentColor;
      content: "";
    }

    .synapse-ai-send-icon::after {
      position: absolute;
      right: 3px;
      top: 9px;
      width: 13px;
      height: 2px;
      border-radius: 999px;
      background: currentColor;
      content: "";
      transform: rotate(-45deg);
      transform-origin: right center;
    }

    .synapse-ai-mic.is-listening {
      border-color: rgba(156, 255, 88, 0.44);
      background: rgba(156, 255, 88, 0.12);
      color: #dfffca;
    }

    html.synapse-focus-active ytd-watch-flexy #secondary,
    html.synapse-focus-active ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    html.synapse-focus-active ytd-watch-flexy ytd-comments,
    html.synapse-focus-active ytd-watch-flexy #comments,
    html.synapse-focus-active ytd-browse ytd-reel-shelf-renderer,
    html.synapse-focus-active ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
    html.synapse-focus-active ytd-browse[page-subtype="subscriptions"] ytd-rich-grid-renderer,
    html.synapse-focus-active a[href^="/shorts"],
    html.synapse-focus-active a[href*="/shorts/"],
    html.synapse-focus-active [aria-label="Shorts"],
    html.synapse-focus-active a[href="/explore/"],
    html.synapse-focus-active a[href^="/reels"],
    html.synapse-focus-active a[href="/reels/"],
    html.synapse-focus-active [href="/explore"],
    html.synapse-focus-active [data-testid="sidebarColumn"],
    html.synapse-focus-active [aria-label*="Trending"],
    html.synapse-focus-active [aria-label*="Who to follow"] {
      filter: blur(10px) saturate(0.5) !important;
      opacity: 0.16 !important;
      pointer-events: none !important;
      transition: filter 240ms ease, opacity 240ms ease !important;
    }

    html.synapse-focus-active #movie_player,
    html.synapse-focus-active #player,
    html.synapse-focus-active #player-container,
    html.synapse-focus-active #primary,
    html.synapse-focus-active ytd-watch-flexy #primary,
    html.synapse-focus-active ytd-watch-flexy video {
      filter: none !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function ensureLayer() {
  ensureBaseStyles();

  if (layerEl && document.body?.contains(layerEl)) return layerEl;

  layerEl = document.createElement("div");
  layerEl.id = "synapse-focus-layer";
  document.body.appendChild(layerEl);
  return layerEl;
}

function showToast(message, label = "FOCUSLOCK") {
  whenBodyReady(() => {
    const layer = ensureLayer();
    const existing = layer.querySelector(".synapse-focus-toast");
    if (existing) existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);

    const toast = document.createElement("div");
    toast.className = "synapse-focus-toast";
    toast.innerHTML = `<span>${escapeHtml(message)}</span><small>${escapeHtml(label)}</small>`;
    layer.appendChild(toast);

    toastTimeout = setTimeout(() => {
      toast.style.transition = "opacity 220ms ease, transform 220ms ease";
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%, -10px) scale(0.98)";
      setTimeout(() => toast.remove(), 240);
    }, 2800);
  });
}

function showCenterNotice(title, message, duration = 2600) {
  whenBodyReady(() => {
    const layer = ensureLayer();
    if (centerNoticeEl) centerNoticeEl.remove();

    const markHtml = focusLockIconUrl
      ? `<img src="${focusLockIconUrl}" alt="" />`
      : "<span>F</span>";

    centerNoticeEl = document.createElement("div");
    centerNoticeEl.className = "synapse-focus-notice-backdrop";
    centerNoticeEl.innerHTML = `
      <div class="synapse-focus-notice">
        <div class="synapse-focus-mark">${markHtml}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
    layer.appendChild(centerNoticeEl);

    setTimeout(() => {
      if (!centerNoticeEl) return;
      centerNoticeEl.style.transition = "opacity 300ms ease";
      centerNoticeEl.style.opacity = "0";
      setTimeout(() => {
        centerNoticeEl?.remove();
        centerNoticeEl = null;
      }, 320);
    }, duration);
  });
}

function showLockedBadge() {
  whenBodyReady(() => {
    ensureBaseStyles();
    document.documentElement.classList.add("synapse-focus-active");

    const existing = document.getElementById("synapse-focus-badge");
    if (existing) existing.remove();

    const badge = document.createElement("div");
    badge.id = "synapse-focus-badge";
    badge.className = "synapse-focus-badge";
    badge.innerHTML = "<i></i><span>Focus Lock</span>";
    document.body.appendChild(badge);
  });
}

function removeLockedBadge() {
  document.documentElement.classList.remove("synapse-focus-active");
  document.getElementById("synapse-focus-badge")?.remove();
}

function playAlertSound(type = "violation") {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const notes = type === "milestone" ? [523.25, 659.25, 783.99] : [220, 185, 220];

    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type === "milestone" ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(type === "milestone" ? 0.042 : 0.055, now + index * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.1);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + index * 0.1);
      oscillator.stop(now + index * 0.1 + 0.11);
    });

    if (navigator.vibrate) {
      navigator.vibrate(type === "milestone" ? [70, 55, 70] : [100, 70, 100]);
    }

    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch (_) {
    // Audio can be blocked until the page receives a user gesture.
  }
}

function notifyViolation(reason = "tab-switch") {
  safeRuntimeSendMessage({ type: "TAB_VIOLATION", reason, url: location.href });
}

function markBenignStudyControl(duration = 1800) {
  benignStudyControlUntil = Math.max(benignStudyControlUntil, Date.now() + duration);
}

function isBenignStudyControlActive() {
  return Date.now() < benignStudyControlUntil;
}

function markSynapseAiInteraction(duration = 4500) {
  markBenignStudyControl(duration);

  const now = Date.now();
  if (now - lastSynapseAiInteractionAt < 900) return;
  lastSynapseAiInteractionAt = now;
  safeRuntimeSendMessage(
    {
      type: "SYNAPSE_AI_INTERACTION",
      durationMs: duration
    },
    ignoreRuntimeError
  );
}

function isSynapseAiEvent(event) {
  const path = event.composedPath?.() || [];
  return Boolean(
    synapseAiWidgetEl && path.includes(synapseAiWidgetEl)
    || synapseAiPanelEl && path.includes(synapseAiPanelEl)
  );
}

function isYouTubeHost() {
  return location.hostname === "youtube.com" || location.hostname.endsWith(".youtube.com");
}

function getActiveVideo() {
  return document.querySelector("video");
}

function clearPauseReminder() {
  if (videoPauseTimeout) {
    clearTimeout(videoPauseTimeout);
    videoPauseTimeout = null;
  }

  if (pauseAlertInterval) {
    clearInterval(pauseAlertInterval);
    pauseAlertInterval = null;
  }

  pauseReminderShown = false;
}

function startPauseReminder() {
  // Pausing a lecture is a normal study action, not a distraction attempt.
  clearPauseReminder();
}

function schedulePauseReminder() {
  clearPauseReminder();

  const video = getActiveVideo();
  if (!isLocked || !video || !video.paused || video.ended) return;

  videoPauseTimeout = setTimeout(() => {
    const activeVideo = getActiveVideo();
    if (!isLocked || !activeVideo || !activeVideo.paused || activeVideo.ended) return;
    startPauseReminder();
  }, 5 * 60 * 1000);
}

function attachVideoPauseWatcher() {
  const bindVideo = () => {
    const video = getActiveVideo();
    if (!video || video.dataset.synapseFocusBound === "true") return;

    video.dataset.synapseFocusBound = "true";
    video.addEventListener("pause", schedulePauseReminder);
    video.addEventListener("play", clearPauseReminder);
    video.addEventListener("ended", clearPauseReminder);

    if (video.paused && !video.ended) {
      schedulePauseReminder();
    }
  };

  bindVideo();
  setTimeout(bindVideo, 800);
  setTimeout(bindVideo, 2200);
}

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function isYouTubeMiniPlayerShortcut(event) {
  return isYouTubeHost()
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.shiftKey
    && (event.key || "").toLowerCase() === "i"
    && !isTypingTarget(event.target);
}

function shouldBlockShortcut(event) {
  const key = event.key || "";
  const lowerKey = key.toLowerCase();
  const commandOrControl = event.ctrlKey || event.metaKey;

  if (key === "Escape") return true;
  if (key === "F11" || key === "F6" || key === "F5") return true;
  if (event.altKey && (key === "Tab" || key === "F4" || key === "Home" || key === "ArrowLeft" || key === "ArrowRight" || key === " ")) return true;
  if (event.metaKey && ["tab", "`", "t", "w", "q", "n", "l", "r", "m", "h", "[", "]"].includes(lowerKey)) return true;
  if (event.ctrlKey && ["tab", "t", "w", "q", "n", "l", "r", "pageup", "pagedown", "escape"].includes(lowerKey)) return true;
  if (commandOrControl && event.shiftKey && ["t", "w", "q", "i", "j", "c", "tab"].includes(lowerKey)) return true;
  if (commandOrControl && /^[1-9]$/.test(key)) return true;
  if (isYouTubeMiniPlayerShortcut(event)) return true;

  const youtubeFullscreenToggle = isYouTubeHost()
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.shiftKey
    && lowerKey === "f"
    && !isTypingTarget(event.target);

  return youtubeFullscreenToggle;
}

function getShortcutReason(event) {
  const lowerKey = (event.key || "").toLowerCase();
  const commandOrControl = event.ctrlKey || event.metaKey;

  if (event.key === "Escape" || event.key === "F11" || lowerKey === "f") return "fullscreen-exit";
  if (isYouTubeMiniPlayerShortcut(event)) return "miniplayer";
  if (commandOrControl && lowerKey === "t") return "new-tab";
  if (commandOrControl && lowerKey === "n") return "new-window";
  if (commandOrControl && lowerKey === "w") return "tab-close";
  if (event.altKey && (event.key === "Tab" || event.key === "F4")) return "window-switch";
  if (event.metaKey && (lowerKey === "m" || lowerKey === "h")) return "window-switch";
  if (lowerKey === "tab" || lowerKey === "pageup" || lowerKey === "pagedown" || /^[1-9]$/.test(event.key || "")) {
    return "tab-switch";
  }

  return "keyboard-shortcut";
}

function handleBlockedShortcut(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (event.key === "Escape") {
    handleFullscreenExit("fullscreen-exit");
    return;
  }

  if (isYouTubeMiniPlayerShortcut(event)) {
    blockMiniPlayer("keyboard");
    return;
  }

  if (isYouTubeHost() && event.key?.toLowerCase() === "f") {
    showToast("Fullscreen stays on while the session is active.");
    goFullscreen();
    notifyViolation("fullscreen-exit");
    return;
  }

  const now = Date.now();
  if (now - lastKeyboardWarningAt > 850) {
    lastKeyboardWarningAt = now;
    const message = interruptionMessages[Math.floor(Math.random() * interruptionMessages.length)];
    showToast(message);
    playAlertSound("violation");
    notifyViolation(getShortcutReason(event));
  }
}

document.addEventListener("keydown", (event) => {
  if (!isLocked) return;
  if (isSynapseAiEvent(event)) {
    markSynapseAiInteraction(7000);
    return;
  }
  if (shouldBlockShortcut(event)) {
    handleBlockedShortcut(event);
  }
}, true);

document.addEventListener("visibilitychange", () => {
  if (!isLocked || !document.hidden) return;
  if (isBenignStudyControlActive()) return;
  const now = Date.now();
  if (now - blurViolationCooldown < 900) return;
  blurViolationCooldown = now;
  notifyViolation("tab-switch");
});

window.addEventListener("blur", () => {
  if (!isLocked) return;
  if (isBenignStudyControlActive()) return;
  const now = Date.now();
  if (now - blurViolationCooldown < 900) return;
  blurViolationCooldown = now;
  notifyViolation("window-switch");
}, true);

function handleFullscreenExit(reason = "fullscreen-exit") {
  if (isBenignStudyControlActive()) {
    setTimeout(() => goFullscreen(), 300);
    return;
  }

  fullscreenWarningCount += 1;
  const message = fullscreenWarningCount >= 3
    ? "Come back to your session."
    : interruptionMessages[fullscreenWarningCount % interruptionMessages.length];
  showCenterNotice("Stay focused.", `${message} Returning you to focus on ${platformLabel}.`);
  notifyViolation(reason);
  setTimeout(() => goFullscreen(), 300);
}

function startFullscreenGuard() {
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
}

function stopFullscreenGuard() {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
}

let reenteringFullscreen = false;
function onFullscreenChange() {
  if (!isLocked || reenteringFullscreen) return;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    handleFullscreenExit("fullscreen-exit");
  }
}

function goFullscreen() {
  if (!isLocked) return;
  reenteringFullscreen = true;

  const clearReentry = () => {
    setTimeout(() => {
      reenteringFullscreen = false;
    }, 850);
  };

  const youtubeButton = document.querySelector(".ytp-fullscreen-button");
  if (youtubeButton && !document.fullscreenElement) {
    youtubeButton.click();
    clearReentry();
    return;
  }

  const video = document.querySelector("video");
  if (video?.requestFullscreen) {
    video.requestFullscreen()
      .catch(() => document.documentElement.requestFullscreen?.().catch(() => {}))
      .finally(clearReentry);
    return;
  }

  document.documentElement.requestFullscreen?.().catch(() => {}).finally(clearReentry);
}

function getYTVideoId() {
  try {
    return new URLSearchParams(window.location.search).get("v");
  } catch (_) {
    return null;
  }
}

function blockMiniPlayer(reason = "keyboard") {
  const message = reason === "keyboard"
    ? "Mini-player shortcut blocked. Stay with the lesson."
    : "Mini-player blocked. Finish the current lesson first.";

  showCenterNotice("Stay with the lecture", message);
  notifyViolation("miniplayer");

  const closeButton = document.querySelector(".ytp-miniplayer-close-button, button[title*='Close mini player'], button[aria-label*='Close mini player'], button[aria-label*='Close miniplayer'], button[title*='Close miniplayer']");
  if (closeButton) setTimeout(() => closeButton.click(), 120);
}

function isVisibleElement(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  return rect.width > 0
    && rect.height > 0
    && styles.visibility !== "hidden"
    && styles.display !== "none"
    && Number(styles.opacity || 1) > 0;
}

function getYouTubeAdSkipButton() {
  const selectors = [
    "#movie_player .ytp-ad-skip-button",
    "#movie_player .ytp-ad-skip-button-modern",
    "#movie_player .ytp-skip-ad-button",
    "#movie_player button[class*='ytp-ad-skip']",
    "#movie_player button[class*='skip-ad']",
    "#movie_player button[aria-label*='Skip']",
    "#movie_player button[title*='Skip']"
  ];

  return selectors
    .map((selector) => document.querySelector(selector))
    .find((button) => {
      if (!button || !isVisibleElement(button)) return false;
      const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.textContent || ""}`.toLowerCase();
      return label.includes("skip");
    });
}

function getYouTubeAdCloseButton() {
  const selectors = [
    "#movie_player .ytp-ad-overlay-close-button",
    "#movie_player button[aria-label*='Close ad']",
    "#movie_player button[title*='Close ad']"
  ];

  return selectors
    .map((selector) => document.querySelector(selector))
    .find((button) => button && isVisibleElement(button));
}

function isYouTubeAdControl(target) {
  return Boolean(target?.closest?.(
    ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-overlay-close-button, button[class*='ytp-ad-skip'], button[class*='skip-ad'], button[aria-label*='Skip'], button[title*='Skip'], button[aria-label*='Close ad'], button[title*='Close ad']"
  ));
}

function isYouTubePlaybackControl(target) {
  return Boolean(target?.closest?.(
    "video, .html5-main-video, .ytp-play-button, button[title='Play'], button[title='Pause'], button[aria-label^='Play'], button[aria-label^='Pause']"
  ));
}

function trySkipYouTubeAd({ quiet = true } = {}) {
  if (!isLocked || !isYouTubeHost()) return false;

  const button = getYouTubeAdSkipButton() || getYouTubeAdCloseButton();
  if (!button) return false;

  const now = Date.now();
  if (now - lastAdSkipAt < 1400) return true;

  lastAdSkipAt = now;
  markBenignStudyControl();
  button.click();
  if (!quiet) showToast("Ad skipped. Back to the lesson.");
  return true;
}

function startYouTubeAdGuard() {
  if (!isYouTubeHost()) return;
  stopYouTubeAdGuard();

  whenBodyReady(() => {
    trySkipYouTubeAd({ quiet: true });

    const target = document.querySelector("#movie_player") || document.body;
    ytAdObserver = new MutationObserver(() => {
      trySkipYouTubeAd({ quiet: true });
    });
    ytAdObserver.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-label", "title"]
    });

    ytAdSkipInterval = setInterval(() => {
      trySkipYouTubeAd({ quiet: true });
    }, 1200);
  });
}

function stopYouTubeAdGuard() {
  if (ytAdObserver) {
    ytAdObserver.disconnect();
    ytAdObserver = null;
  }

  if (ytAdSkipInterval) {
    clearInterval(ytAdSkipInterval);
    ytAdSkipInterval = null;
  }
}

function blockYouTubeNavigation() {
  if (!isYouTubeHost()) return;
  lockedVideoId = getYTVideoId();
  if (!lockedVideoId) return;

  document.removeEventListener("click", blockYTClicks, true);
  document.addEventListener("click", blockYTClicks, true);

  let lastUrl = location.href;
  if (ytNavigationObserver) ytNavigationObserver.disconnect();

  ytNavigationObserver = new MutationObserver(() => {
    if (!isLocked || location.href === lastUrl) return;

    lastUrl = location.href;
    const newId = getYTVideoId();
    const isShorts = location.pathname.startsWith("/shorts");

    if (isShorts || (newId && lockedVideoId && newId !== lockedVideoId)) {
      history.back();
      showCenterNotice("Recommendation blocked", "Finish the current lesson before opening another video.");
    }
  });

  whenBodyReady(() => {
    ytNavigationObserver.observe(document.body, { subtree: true, childList: true });
  });

  attachVideoPauseWatcher();
  startYouTubeAdGuard();
}

function blockYTClicks(event) {
  if (!isLocked) return;
  if (isSynapseAiEvent(event)) {
    markSynapseAiInteraction(7000);
    return;
  }

  if (isYouTubeAdControl(event.target)) {
    markBenignStudyControl();
    setTimeout(() => trySkipYouTubeAd({ quiet: false }), 0);
    return;
  }

  if (isYouTubePlaybackControl(event.target)) {
    markBenignStudyControl();
    return;
  }

  const miniPlayerButton = event.target.closest(".ytp-miniplayer-button, button[title*='Miniplayer'], button[aria-label*='Miniplayer'], button[title*='mini player'], button[aria-label*='mini player'], button[title*='miniplayer'], button[aria-label*='miniplayer']");
  if (miniPlayerButton) {
    event.preventDefault();
    event.stopPropagation();
    blockMiniPlayer("button");
    return;
  }

  const link = event.target.closest("a[href*='/watch'], a[href^='/shorts'], a[href*='/shorts/']");
  if (!link) return;

  const href = link.getAttribute("href") || "";
  const clickedId = new URLSearchParams(href.split("?")[1] || "").get("v");
  const isShorts = href.includes("/shorts");

  if (isShorts || (clickedId && clickedId !== lockedVideoId)) {
    event.preventDefault();
    event.stopPropagation();
    showToast("That recommendation can wait.");
  }
}

function activateSessionUi(session = currentSession) {
  currentSession = session || currentSession;
  isLocked = true;
  showLockedBadge();
  startFullscreenGuard();
  blockYouTubeNavigation();
  startYouTubeAdGuard();
  attachVideoPauseWatcher();
}

function deactivateSessionUi() {
  isLocked = false;
  currentSession = null;
  fullscreenWarningCount = 0;
  removeLockedBadge();
  stopFullscreenGuard();

  if (ytNavigationObserver) {
    ytNavigationObserver.disconnect();
    ytNavigationObserver = null;
  }

  document.removeEventListener("click", blockYTClicks, true);
  stopYouTubeAdGuard();
  clearPauseReminder();

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function showCompletionCelebration(session = {}, focusSeconds = 0) {
  const totalSeconds = session.durationSeconds || focusSeconds || Math.max(1, Math.floor((Date.now() - (session.startTime || Date.now())) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const durationLabel = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  playAlertSound("milestone");
  showCenterNotice("Focus session completed.", `You finished ${durationLabel}. Your session is ready in Synapse analytics.`, 5200);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDefaultAiPosition() {
  return {
    x: Math.max(12, window.innerWidth - 68),
    y: 22
  };
}

function getSafeAiPosition(position = null) {
  const fallback = getDefaultAiPosition();
  const x = Number(position?.x ?? fallback.x);
  const y = Number(position?.y ?? fallback.y);

  return {
    x: clamp(Number.isFinite(x) ? x : fallback.x, 8, Math.max(8, window.innerWidth - 54)),
    y: clamp(Number.isFinite(y) ? y : fallback.y, 8, Math.max(8, window.innerHeight - 54))
  };
}

function saveAiWidgetPosition() {
  if (!synapseAiWidgetEl) return;
  const rect = synapseAiWidgetEl.getBoundingClientRect();
  const position = getSafeAiPosition({ x: rect.left, y: rect.top });
  synapseAiStatus = { ...(synapseAiStatus || {}), position };
  safeRuntimeSendMessage({ type: "SAVE_AI_WIDGET_POSITION", position }, ignoreRuntimeError);
}

function renderInlineMarkdown(value = "") {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function normalizeAiMarkdown(value = "") {
  const parts = String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (index % 2 === 1) return part.trim();

    return part
      .replace(/[ \t]+\n/g, "\n")
      .replace(/([^\n])\s+(#{1,4}\s+)/g, "$1\n\n$2")
      .replace(/([^\n])\s+((?:[-*]\s+|\d+\.\s+)(?=[A-Z0-9(]))/g, "$1\n$2")
      .replace(/(#{1,4}\s+[^#\n]+?)\s+(#{1,4}\s+)/g, "$1\n\n$2")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }).filter(Boolean).join("\n\n");
}

function renderMarkdown(value = "") {
  const text = normalizeAiMarkdown(value);
  if (!text) return "";

  const blocks = text.split(/(```[\s\S]*?```)/g).filter(Boolean);

  return blocks.map((block) => {
    if (block.startsWith("```")) {
      const code = block.replace(/^```[\w-]*\n?/, "").replace(/```$/, "").trimEnd();
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }

    const lines = block.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let listType = "";
    let paragraph = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    };

    const closeList = () => {
      if (!listType) return;
      html.push(`</${listType}>`);
      listType = "";
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }

      const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
      if (heading) {
        flushParagraph();
        closeList();
        const level = Math.min(3, heading[1].length);
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        return;
      }

      const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
      if (bullet) {
        flushParagraph();
        if (listType !== "ul") {
          closeList();
          html.push("<ul>");
          listType = "ul";
        }
        html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
        return;
      }

      const numbered = /^\d+\.\s+(.+)$/.exec(trimmed);
      if (numbered) {
        flushParagraph();
        if (listType !== "ol") {
          closeList();
          html.push("<ol>");
          listType = "ol";
        }
        html.push(`<li>${renderInlineMarkdown(numbered[1])}</li>`);
        return;
      }

      closeList();
      paragraph.push(trimmed);
    });

    flushParagraph();
    closeList();
    return html.join("");
  }).join("");
}

function appendAiMessage(role, content, { pending = false } = {}) {
  if (!synapseAiMessagesEl) return null;

  const message = document.createElement("div");
  message.className = `synapse-ai-message ${role}`;
  message.dataset.role = role;
  message.innerHTML = pending ? escapeHtml(content) : renderMarkdown(content);
  synapseAiMessagesEl.appendChild(message);
  synapseAiMessagesEl.scrollTop = synapseAiMessagesEl.scrollHeight;
  return message;
}

function populateAiMessages() {
  if (!synapseAiMessagesEl) return;
  synapseAiMessagesEl.textContent = "";
  const chats = Array.isArray(synapseAiStatus?.session?.aiChats) ? synapseAiStatus.session.aiChats : [];

  if (!chats.length) {
    appendAiMessage(
      "system",
      synapseAiStatus?.session?.active
        ? "Ask quietly. I will keep answers short, structured, and tied to this FocusLock session."
        : "Ask anytime. FocusLock history saves only during an active session."
    );
    return;
  }

  chats.slice(-12).forEach((chat) => {
    if (chat.userMessage) appendAiMessage("user", chat.userMessage);
    if (chat.aiResponse) appendAiMessage("assistant", chat.aiResponse);
  });
}

function positionAiPanel() {
  if (!synapseAiPanelEl || !synapseAiWidgetEl) return;

  const buttonRect = synapseAiWidgetEl.getBoundingClientRect();
  const panelWidth = Math.min(340, window.innerWidth - 24);
  const panelHeight = Math.min(590, window.innerHeight - 28);
  const opensLeft = buttonRect.left > window.innerWidth / 2;
  const left = opensLeft
    ? buttonRect.left - panelWidth - 10
    : buttonRect.right + 10;

  synapseAiPanelEl.style.width = `${panelWidth}px`;
  synapseAiPanelEl.style.height = `${panelHeight}px`;
  synapseAiPanelEl.style.left = `${clamp(left, 12, Math.max(12, window.innerWidth - panelWidth - 12))}px`;
  synapseAiPanelEl.style.top = `${clamp(buttonRect.top, 12, Math.max(12, window.innerHeight - panelHeight - 12))}px`;
}

function resetAiInactivityTimer() {
  if (synapseAiInactivityTimer) clearTimeout(synapseAiInactivityTimer);
  if (!synapseAiPanelOpen) return;
  synapseAiInactivityTimer = setTimeout(() => {
    closeSynapseAiPanel();
  }, 90000);
}

function createAiPanel() {
  if (synapseAiPanelEl && document.body?.contains(synapseAiPanelEl)) return synapseAiPanelEl;

  const panel = document.createElement("section");
  panel.className = "synapse-ai-panel";
  panel.setAttribute("aria-label", "SYNAPSE AI Study Companion");
  panel.innerHTML = `
    <header class="synapse-ai-header">
      <img src="${synapseIconUrl}" alt="" />
      <div class="synapse-ai-title">
        <strong>Study Companion</strong>
        <span>${synapseAiStatus?.session?.active ? "Session active" : "Quiet mode"}</span>
      </div>
      <button class="synapse-ai-close" type="button" aria-label="Minimize SYNAPSE AI">&times;</button>
    </header>
    <div class="synapse-ai-messages" role="log" aria-live="polite"></div>
    <form class="synapse-ai-composer">
      <button class="synapse-ai-icon-button synapse-ai-mic" type="button" aria-label="Voice input" title="Voice input"><span class="synapse-ai-mic-icon" aria-hidden="true"></span></button>
      <textarea rows="1" placeholder="Ask a quick study question..."></textarea>
      <button class="synapse-ai-icon-button synapse-ai-send" type="submit" aria-label="Send question" title="Send"><span class="synapse-ai-send-icon" aria-hidden="true"></span></button>
    </form>
  `;

  document.body.appendChild(panel);
  synapseAiPanelEl = panel;
  synapseAiMessagesEl = panel.querySelector(".synapse-ai-messages");
  synapseAiInputEl = panel.querySelector("textarea");

  panel.querySelector(".synapse-ai-close")?.addEventListener("click", closeSynapseAiPanel);
  panel.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    markSynapseAiInteraction(6000);
    sendSynapseAiPrompt();
  });
  panel.querySelector(".synapse-ai-mic")?.addEventListener("click", toggleSynapseAiVoiceInput);
  panel.addEventListener("pointerdown", () => {
    markSynapseAiInteraction(6000);
    resetAiInactivityTimer();
  }, true);
  panel.addEventListener("keydown", () => {
    markSynapseAiInteraction(6000);
    resetAiInactivityTimer();
  }, true);

  synapseAiInputEl.addEventListener("input", () => {
    markSynapseAiInteraction(6000);
    synapseAiInputEl.style.height = "46px";
    synapseAiInputEl.style.height = `${Math.min(110, synapseAiInputEl.scrollHeight)}px`;
    resetAiInactivityTimer();
  });
  synapseAiInputEl.addEventListener("focus", () => markSynapseAiInteraction(7000));
  synapseAiInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      markSynapseAiInteraction(7000);
      sendSynapseAiPrompt();
    }
  });

  populateAiMessages();
  return panel;
}

function openSynapseAiPanel() {
  markSynapseAiInteraction(7000);
  createAiPanel();
  synapseAiPanelOpen = true;
  synapseAiWidgetEl?.classList.add("is-open");
  synapseAiPanelEl.classList.add("is-open");
  positionAiPanel();
  resetAiInactivityTimer();
  setTimeout(() => synapseAiInputEl?.focus({ preventScroll: true }), 40);
}

function closeSynapseAiPanel() {
  synapseAiPanelOpen = false;
  synapseAiWidgetEl?.classList.remove("is-open");
  synapseAiPanelEl?.classList.remove("is-open");
  if (synapseAiInactivityTimer) clearTimeout(synapseAiInactivityTimer);
}

function toggleSynapseAiPanel() {
  if (synapseAiPanelOpen) {
    closeSynapseAiPanel();
  } else {
    openSynapseAiPanel();
  }
}

function getSynapseAiPageContext() {
  return {
    title: document.title,
    url: location.href,
    selection: String(window.getSelection?.() || "").trim().slice(0, 1200)
  };
}

function shouldUseAmbientAiFallback(response) {
  const error = String(response?.error || "");
  return !synapseAiStatus?.session?.active && /start a focuslock session before using/i.test(error);
}

async function requestAmbientSynapseAiReply(prompt, pageContext) {
  const endpoint = synapseAiStatus?.endpoint;
  if (!endpoint) throw new Error("SYNAPSE AI is unavailable right now.");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "chat",
      sessionId: "",
      session: null,
      pageContext,
      prompt,
      recentMessages: []
    })
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody?.message || errorBody?.error?.message || "";
    } catch (_) {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail || "SYNAPSE AI is unavailable right now.");
  }

  const data = await response.json();
  const reply = data?.message?.trim();
  if (!reply) throw new Error("SYNAPSE AI returned an empty answer.");
  return reply;
}

async function sendSynapseAiPrompt() {
  if (!synapseAiInputEl || synapseAiInFlight) return;

  const prompt = synapseAiInputEl.value.trim();
  if (!prompt) return;

  markSynapseAiInteraction(9000);
  synapseAiInFlight = true;
  synapseAiInputEl.value = "";
  synapseAiInputEl.style.height = "46px";
  appendAiMessage("user", prompt);
  const pending = appendAiMessage("assistant", "Thinking...", { pending: true });
  const sendButton = synapseAiPanelEl?.querySelector(".synapse-ai-send");
  if (sendButton) sendButton.disabled = true;
  const pageContext = getSynapseAiPageContext();

  const finishRequest = () => {
    synapseAiInFlight = false;
    if (sendButton) sendButton.disabled = false;
    resetAiInactivityTimer();
  };

  safeRuntimeSendMessage(
    {
      type: "SYNAPSE_AI_CHAT",
      prompt,
      sessionId: synapseAiStatus?.session?.sessionId || "",
      pageContext
    },
    (response) => {
      if (!response?.success) {
        if (shouldUseAmbientAiFallback(response)) {
          requestAmbientSynapseAiReply(prompt, pageContext)
            .then((reply) => {
              if (pending) pending.innerHTML = renderMarkdown(reply);
            })
            .catch((error) => {
              if (pending) pending.innerHTML = renderMarkdown(error?.message || "SYNAPSE AI is unavailable right now.");
            })
            .finally(finishRequest);
          return;
        }

        finishRequest();
        if (pending) pending.innerHTML = renderMarkdown(response?.error || "SYNAPSE AI is unavailable right now.");
        return;
      }

      if (pending) pending.innerHTML = renderMarkdown(response.chat?.aiResponse || "Done.");
      if (response.aiStatus) {
        synapseAiStatus = { ...synapseAiStatus, ...response.aiStatus };
        if (response.chat && synapseAiStatus.session?.sessionId === response.chat.sessionId) {
          const chats = Array.isArray(synapseAiStatus.session.aiChats) ? synapseAiStatus.session.aiChats : [];
          synapseAiStatus.session.aiChats = [...chats, response.chat].slice(-80);
        }
      }
      finishRequest();
    }
  );
}

function toggleSynapseAiVoiceInput() {
  markSynapseAiInteraction(9000);
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micButton = synapseAiPanelEl?.querySelector(".synapse-ai-mic");

  if (!SpeechRecognition) {
    appendAiMessage("system", "Voice input is not supported in this browser tab.");
    return;
  }

  if (synapseAiSpeechRecognition) {
    synapseAiSpeechRecognition.stop();
    synapseAiSpeechRecognition = null;
    micButton?.classList.remove("is-listening");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  synapseAiSpeechRecognition = recognition;
  micButton?.classList.add("is-listening");

  let finalTranscript = "";
  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0]?.transcript || "";
      if (event.results[index].isFinal) finalTranscript += transcript;
      else interim += transcript;
    }
    if (synapseAiInputEl) synapseAiInputEl.value = `${finalTranscript}${interim}`.trim();
  };
  recognition.onend = () => {
    synapseAiSpeechRecognition = null;
    micButton?.classList.remove("is-listening");
    synapseAiInputEl?.focus({ preventScroll: true });
  };
  recognition.onerror = () => {
    synapseAiSpeechRecognition = null;
    micButton?.classList.remove("is-listening");
  };
  recognition.start();
}

function createSynapseAiWidget() {
  if (synapseAiWidgetEl && document.body?.contains(synapseAiWidgetEl)) return synapseAiWidgetEl;

  ensureBaseStyles();
  const button = document.createElement("button");
  button.id = "synapse-ai-widget";
  button.className = "synapse-ai-widget";
  button.type = "button";
  button.setAttribute("aria-label", "Open SYNAPSE AI Companion");
  button.title = "SYNAPSE AI Companion";
  button.innerHTML = `<img src="${synapseIconUrl}" alt="" />`;
  document.body.appendChild(button);
  synapseAiWidgetEl = button;

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    markSynapseAiInteraction(7000);
    const rect = button.getBoundingClientRect();
    synapseAiDragState = {
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false
    };
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("is-dragging");
  });

  button.addEventListener("pointermove", (event) => {
    if (!synapseAiDragState) return;
    markSynapseAiInteraction(7000);
    const dx = event.clientX - synapseAiDragState.startX;
    const dy = event.clientY - synapseAiDragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) synapseAiDragState.moved = true;
    const next = getSafeAiPosition({
      x: synapseAiDragState.originX + dx,
      y: synapseAiDragState.originY + dy
    });
    button.style.left = `${next.x}px`;
    button.style.top = `${next.y}px`;
    if (synapseAiPanelOpen) positionAiPanel();
  });

  button.addEventListener("pointerup", (event) => {
    markSynapseAiInteraction(7000);
    const wasDrag = synapseAiDragState?.moved;
    synapseAiDragState = null;
    button.releasePointerCapture?.(event.pointerId);
    button.classList.remove("is-dragging");
    saveAiWidgetPosition();
    if (!wasDrag) toggleSynapseAiPanel();
  });

  return button;
}

function placeSynapseAiWidget() {
  if (!synapseAiWidgetEl) return;
  const position = getSafeAiPosition(synapseAiStatus?.position || synapseAiStatus?.settings?.aiButtonPosition);
  synapseAiWidgetEl.style.left = `${position.x}px`;
  synapseAiWidgetEl.style.top = `${position.y}px`;
}

function removeSynapseAiCompanion() {
  closeSynapseAiPanel();
  synapseAiWidgetEl?.remove();
  synapseAiPanelEl?.remove();
  synapseAiWidgetEl = null;
  synapseAiPanelEl = null;
  synapseAiMessagesEl = null;
  synapseAiInputEl = null;
}

function refreshSynapseAiCompanion(status = synapseAiStatus) {
  synapseAiStatus = { ...(synapseAiStatus || {}), ...(status || {}) };
  if (!synapseAiStatus?.enabled) {
    removeSynapseAiCompanion();
    return;
  }

  whenBodyReady(() => {
    createSynapseAiWidget();
    placeSynapseAiWidget();
    if (synapseAiPanelOpen) {
      createAiPanel();
      positionAiPanel();
    }
  });
}

function requestSynapseAiStatus() {
  safeRuntimeSendMessage({ type: "GET_AI_STATUS" }, (response) => {
    if (response?.success) refreshSynapseAiCompanion(response);
  });
}

function postSyncPayload(payload) {
  if (!dashboardConnected || !payload) return;
  window.postMessage(
    {
      source: "SYNAPSE_FOCUS_EXTENSION",
      type: "SYNAPSE_FOCUS_SYNC",
      payload
    },
    window.location.origin
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data || {};

  if (data.source !== "SYNAPSE_DASHBOARD") return;

  if (data.type === "DASHBOARD_READY") {
    dashboardConnected = true;
    safeRuntimeSendMessage(
      {
        type: "DASHBOARD_CONNECTED",
        uid: data.uid,
        origin: data.origin || window.location.origin,
        url: location.href
      },
      (response) => {
        if (response?.payload) postSyncPayload(response.payload);
      }
    );
  }

  if (data.type === "SYNAPSE_FOCUS_ACK") {
    safeRuntimeSendMessage(
      {
        type: "DASHBOARD_SYNC_ACK",
        uid: data.uid,
        syncedAt: data.syncedAt || Date.now()
      },
      ignoreRuntimeError
    );
  }
});

if (hasRuntime()) {
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "VIOLATION_DETECTED") {
        activateSessionUi(message.session);
        const warning = reasonMessages[message.reason] || interruptionMessages[Math.floor(Math.random() * interruptionMessages.length)];
        showToast(warning);
        playAlertSound("violation");
      }

      if (message.type === "SHOW_IMMEDIATE_WARNING" || message.type === "NEW_TAB_BLOCKED") {
        const reason = message.reason || "new-tab";
        showCenterNotice("Distraction paused", reasonMessages[reason] || "Come back to your session.");
        playAlertSound("violation");
      }

      if (message.type === "SESSION_STARTED" || message.type === "SESSION_RESYNC") {
        activateSessionUi(message.session);
        refreshSynapseAiCompanion({ session: message.session || null });
        requestSynapseAiStatus();
        fullscreenWarningCount = 0;

        const tryFullscreen = () => {
          const youtubeButton = document.querySelector(".ytp-fullscreen-button");
          if (youtubeButton && !document.fullscreenElement) {
            youtubeButton.click();
            return true;
          }

          const video = document.querySelector("video");
          if (video?.requestFullscreen && !document.fullscreenElement) {
            video.requestFullscreen().catch(() => {});
            return true;
          }

          return false;
        };

        if (!tryFullscreen()) {
          setTimeout(tryFullscreen, 700);
          setTimeout(tryFullscreen, 1800);
          setTimeout(tryFullscreen, 3200);
        }

        showToast("Focus Lock is active.");
      }

      if (message.type === "MOTIVATION_MILESTONE") {
        activateSessionUi(message.session);
        refreshSynapseAiCompanion({ session: message.session || null });
        requestSynapseAiStatus();
        const baseMessage = message.message || milestoneMessages[(message.milestoneCount - 1) % milestoneMessages.length];
        showCenterNotice(baseMessage, `${message.totalMinutes} focused minutes completed.`, 4200);
      }

      if (message.type === "STOP_WARNING") {
        activateSessionUi(message.session);
        refreshSynapseAiCompanion({ session: message.session || null });
        requestSynapseAiStatus();
        showCenterNotice(
          `Stop check ${message.warningCount}/${message.warningsRequired}`,
          message.message || "Take one breath before ending the session.",
          3800
        );
      }

      if (message.type === "SESSION_ENDED") {
        deactivateSessionUi();
        refreshSynapseAiCompanion({ session: null });
        showToast("Focus session saved.");
      }

      if (message.type === "SESSION_COMPLETED") {
        deactivateSessionUi();
        refreshSynapseAiCompanion({ session: null });
        showCompletionCelebration(message.session || {}, message.focusSeconds || 0);
      }

      if (message.type === "BREAK_STARTED") {
        deactivateSessionUi();
        refreshSynapseAiCompanion({ session: null });
        showCenterNotice("Break started", "You have six minutes. Focus Lock will bring you back.", 3600);
      }

      if (message.type === "BREAK_ENDED") {
        activateSessionUi(message.session);
        refreshSynapseAiCompanion({ session: message.session || null });
        requestSynapseAiStatus();
        showCenterNotice("Break complete", "Time to return to the session.", 3600);
      }

      if (message.type === "DASHBOARD_SYNC_PUSH") {
        postSyncPayload(message.payload);
      }
    });
  } catch (_) {
    extensionContextAlive = false;
  }
}

safeRuntimeSendMessage({ type: "GET_SESSION" }, (response) => {
  if (response?.session?.active) {
    activateSessionUi(response.session);
  }
});

requestSynapseAiStatus();

window.addEventListener("resize", () => {
  placeSynapseAiWidget();
  positionAiPanel();
});

try {
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.synapseFocusSettings || changes.synapseFocusSession) {
      requestSynapseAiStatus();
    }
  });
} catch (_) {
  // Storage change listeners are unavailable after extension reloads.
}
