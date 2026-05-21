let isLocked = false;
let currentSession = null;
let layerEl = null;
let toastTimeout = null;
let centerNoticeEl = null;
let fullscreenWarningCount = 0;
let ytNavigationObserver = null;
let lockedVideoId = null;
let blurViolationCooldown = 0;
let videoPauseTimeout = null;
let pauseAlertInterval = null;
let pauseReminderShown = false;
let dashboardConnected = false;
let lastKeyboardWarningAt = 0;
const focusLockIconUrl = chrome.runtime.getURL("assets/icon128.png");

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
  "tab-close": "Focus tab restored. Finish the session before closing it."
};

function ignoreRuntimeError() {
  void chrome.runtime.lastError;
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

    centerNoticeEl = document.createElement("div");
    centerNoticeEl.className = "synapse-focus-notice-backdrop";
    centerNoticeEl.innerHTML = `
      <div class="synapse-focus-notice">
        <div class="synapse-focus-mark"><img src="${focusLockIconUrl}" alt="" /></div>
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
  chrome.runtime.sendMessage({ type: "TAB_VIOLATION", reason, url: location.href }, ignoreRuntimeError);
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
  if (!isLocked || pauseReminderShown) return;
  pauseReminderShown = true;

  showCenterNotice("Resume the lesson", "Your study video has been paused for five minutes.");
  pauseAlertInterval = setInterval(() => {
    const video = getActiveVideo();
    if (!isLocked || !video || !video.paused || video.ended) {
      clearPauseReminder();
      return;
    }

    showToast("Still paused. Come back when you are ready to continue.");
  }, 20000);
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

  const youtubeFullscreenToggle = location.hostname.includes("youtube.com")
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
  if (commandOrControl && lowerKey === "t") return "new-tab";
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

  if (location.hostname.includes("youtube.com") && event.key?.toLowerCase() === "f") {
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
  if (shouldBlockShortcut(event)) {
    handleBlockedShortcut(event);
  }
}, true);

document.addEventListener("visibilitychange", () => {
  if (!isLocked || !document.hidden) return;
  const now = Date.now();
  if (now - blurViolationCooldown < 900) return;
  blurViolationCooldown = now;
  notifyViolation("tab-switch");
});

window.addEventListener("blur", () => {
  if (!isLocked) return;
  const now = Date.now();
  if (now - blurViolationCooldown < 900) return;
  blurViolationCooldown = now;
  notifyViolation("window-switch");
}, true);

function handleFullscreenExit(reason = "fullscreen-exit") {
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
  notifyViolation("video-change");

  const closeButton = document.querySelector(".ytp-miniplayer-close-button, button[title*='Close mini player'], button[aria-label*='Close mini player']");
  if (closeButton) setTimeout(() => closeButton.click(), 120);
}

function blockYouTubeNavigation() {
  if (!location.hostname.includes("youtube.com")) return;
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
      notifyViolation("video-change");
    }
  });

  whenBodyReady(() => {
    ytNavigationObserver.observe(document.body, { subtree: true, childList: true });
  });

  attachVideoPauseWatcher();
}

function blockYTClicks(event) {
  if (!isLocked) return;

  const miniPlayerButton = event.target.closest(".ytp-miniplayer-button, button[title*='Miniplayer'], button[aria-label*='Miniplayer']");
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
    notifyViolation("video-change");
  }
}

function activateSessionUi(session = currentSession) {
  currentSession = session || currentSession;
  isLocked = true;
  showLockedBadge();
  startFullscreenGuard();
  blockYouTubeNavigation();
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
    chrome.runtime.sendMessage(
      {
        type: "DASHBOARD_CONNECTED",
        uid: data.uid,
        origin: data.origin || window.location.origin,
        url: location.href
      },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.payload) postSyncPayload(response.payload);
      }
    );
  }

  if (data.type === "SYNAPSE_FOCUS_ACK") {
    chrome.runtime.sendMessage(
      {
        type: "DASHBOARD_SYNC_ACK",
        uid: data.uid,
        syncedAt: data.syncedAt || Date.now()
      },
      ignoreRuntimeError
    );
  }
});

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
    const baseMessage = message.message || milestoneMessages[(message.milestoneCount - 1) % milestoneMessages.length];
    showCenterNotice(baseMessage, `${message.totalMinutes} focused minutes completed.`, 4200);
  }

  if (message.type === "STOP_WARNING") {
    activateSessionUi(message.session);
    showCenterNotice(
      `Stop check ${message.warningCount}/${message.warningsRequired}`,
      message.message || "Take one breath before ending the session.",
      3800
    );
  }

  if (message.type === "SESSION_ENDED") {
    deactivateSessionUi();
    showToast("Focus session saved.");
  }

  if (message.type === "SESSION_COMPLETED") {
    deactivateSessionUi();
    showCompletionCelebration(message.session || {}, message.focusSeconds || 0);
  }

  if (message.type === "BREAK_STARTED") {
    deactivateSessionUi();
    showCenterNotice("Break started", "You have six minutes. Focus Lock will bring you back.", 3600);
  }

  if (message.type === "BREAK_ENDED") {
    activateSessionUi(message.session);
    showCenterNotice("Break complete", "Time to return to the session.", 3600);
  }

  if (message.type === "DASHBOARD_SYNC_PUSH") {
    postSyncPayload(message.payload);
  }
});

chrome.runtime.sendMessage({ type: "GET_SESSION" }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response?.session?.active) {
    activateSessionUi(response.session);
  }
});
