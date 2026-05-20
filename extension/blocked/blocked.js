const blockedTitle = document.getElementById("blocked-title");
const blockedCopy = document.getElementById("blocked-copy");
const countdown = document.getElementById("countdown");
const countdownLabel = document.getElementById("countdown-label");
const progressBar = document.getElementById("progress-bar");
const currentGoal = document.getElementById("current-goal");
const returnBtn = document.getElementById("return-btn");

const reasonMap = {
  "new-tab": {
    title: "New tab paused.",
    copy: "Your focus tab is still the priority. Return there and keep the session clean."
  },
  "blocked-site": {
    title: "Distraction paused.",
    copy: "This page can wait until the current Focus Lock session is complete."
  },
  "tab-switch": {
    title: "Stay with one tab.",
    copy: "Your study flow works best when the session stays calm and contained."
  }
};

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

function formatHms(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getParams() {
  return new URLSearchParams(location.search);
}

function renderReason() {
  const params = getParams();
  const reason = params.get("reason") || "blocked-site";
  const copy = reasonMap[reason] || reasonMap["blocked-site"];
  blockedTitle.textContent = copy.title;
  blockedCopy.textContent = copy.copy;
}

function renderSession(session) {
  if (!session?.active) {
    countdownLabel.textContent = "Session";
    countdown.textContent = "Complete";
    progressBar.style.width = "100%";
    currentGoal.textContent = "No active Focus Lock session";
    return;
  }

  currentGoal.textContent = session.focusGoal || "Deep study session";

  const tick = () => {
    if (session.endTime && session.durationSeconds) {
      const remaining = Math.max(0, Math.ceil((session.endTime - Date.now()) / 1000));
      const elapsed = Math.max(0, session.durationSeconds - remaining);
      countdown.textContent = formatHms(remaining);
      progressBar.style.width = `${Math.max(0, Math.min(100, (elapsed / session.durationSeconds) * 100))}%`;
      return;
    }

    countdownLabel.textContent = "Focused time";
    const elapsed = Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
    countdown.textContent = formatHms(elapsed);
    progressBar.style.width = "42%";
  };

  tick();
  setInterval(tick, 1000);
}

returnBtn.addEventListener("click", async () => {
  await sendMessage({ type: "RETURN_TO_FOCUS" });
});

renderReason();
sendMessage({ type: "GET_SESSION" }).then((response) => {
  renderSession(response?.session || null);
});
