"use client";

import { AnimatePresence, animate, motion } from "framer-motion";
import { ImagePlus, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateUserPersonalization } from "../services/firestore";
import {
  formatSynapseUsageDateKey,
  getSecondsUntilNextLocalMidnight,
  listenToTodaySynapseUsage,
  normalizeSynapseUsage,
  SYNAPSE_FREE_PLAN_LIMITS
} from "../services/usageLimits";

const avatarFileTypes = ["image/png", "image/jpeg"];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read profile image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load profile image."));
    image.src = src;
  });
}

async function createAvatarDataUrl(file) {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const size = 320;
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = Math.max(0, (image.naturalWidth - side) / 2);
  const sy = Math.max(0, (image.naturalHeight - side) / 2);
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;
  context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.86);
}

function getUsagePercent(value, limit) {
  if (!limit) return 0;
  return Math.min(100, Math.round((value / limit) * 100));
}

function getCompoundUsagePercent(usage) {
  const aiPercent = getUsagePercent(usage.aiInteractions, SYNAPSE_FREE_PLAN_LIMITS.aiInteractions);
  const pdfPercent = getUsagePercent(usage.pdfUploads, SYNAPSE_FREE_PLAN_LIMITS.pdfUploads);
  return Math.max(aiPercent, pdfPercent);
}

function formatResetCountdown(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function getUsageNotice(percent) {
  if (percent >= 100) {
    return {
      tone: "danger",
      label: "Daily limit reached"
    };
  }

  if (percent >= 95) {
    return {
      tone: "orange",
      label: "Almost at today's limit"
    };
  }

  if (percent >= 80) {
    return {
      tone: "amber",
      label: "Approaching today's limit"
    };
  }

  return null;
}

function AnimatedUsageNumber({ value }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const controls = animate(previousValueRef.current, value, {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplayValue(Math.round(latest))
    });

    previousValueRef.current = value;
    return () => controls.stop();
  }, [value]);

  return <span>{displayValue}</span>;
}

function SynapseUsageCard({ usage, secondsToReset, usageError }) {
  const compoundPercent = getCompoundUsagePercent(usage);
  const limitReached =
    usage.aiInteractions >= SYNAPSE_FREE_PLAN_LIMITS.aiInteractions ||
    usage.pdfUploads >= SYNAPSE_FREE_PLAN_LIMITS.pdfUploads;
  const usageNotice = getUsageNotice(limitReached ? 100 : compoundPercent);
  const resetCopy = formatResetCountdown(secondsToReset);

  return (
    <motion.section
      className={`ai-usage-card ${limitReached ? "is-limit-reached" : ""}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      aria-label="Today's AI Usage"
    >
      <div className="ai-usage-card-head">
        <div>
          <p>Today's AI Usage</p>
          <h3>
            <AnimatedUsageNumber value={compoundPercent} />% usage
          </h3>
        </div>
        <span>Free Plan</span>
      </div>

      <div
        className="ai-usage-track"
        aria-label={`Today's usage: ${compoundPercent}%`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={compoundPercent}
      >
        <motion.span
          className="ai-usage-fill"
          initial={{ width: 0 }}
          animate={{ width: `${compoundPercent}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {usageNotice ? (
        <motion.div
          className={`ai-usage-notice is-${usageNotice.tone}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span aria-hidden="true">⚠</span>
          <strong>{usageNotice.label}</strong>
        </motion.div>
      ) : null}

      <div className="ai-usage-reset">
        <span>{limitReached ? "Resets In" : "Daily Reset In"}</span>
        <strong>{resetCopy}</strong>
      </div>

      {usageError ? <p className="ai-usage-error">{usageError}</p> : null}
    </motion.section>
  );
}

export default function ProfileAvatarMenu({
  user,
  profile,
  studentName = "Student",
  modeLabel = "Focus Mode",
  onProfileUpdate
}) {
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState(() => normalizeSynapseUsage(profile?.usage));
  const [usageDateKey, setUsageDateKey] = useState(() => formatSynapseUsageDateKey());
  const [secondsToReset, setSecondsToReset] = useState(() => getSecondsUntilNextLocalMidnight());
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const avatarSrc = profile?.avatarDataUrl || profile?.photoURL || user?.photoURL || "/assets/synapse-icon-cropped.png";
  const displayName = profile?.name || profile?.displayName || user?.displayName || studentName || "Student";

  useEffect(() => {
    const tick = () => {
      setUsageDateKey(formatSynapseUsageDateKey());
      setSecondsToReset(getSecondsUntilNextLocalMidnight());
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setUsage(normalizeSynapseUsage(profile?.usage, usageDateKey));
      return undefined;
    }

    setUsageError("");
    return listenToTodaySynapseUsage(
      user.uid,
      setUsage,
      (error) => setUsageError(error.message || "Usage sync is temporarily unavailable."),
      usageDateKey
    );
  }, [profile?.usage, usageDateKey, user?.uid]);

  useEffect(() => {
    if (!open) return undefined;

    const closeProfileMenu = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeProfileMenu);
    return () => window.removeEventListener("pointerdown", closeProfileMenu);
  }, [open]);

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !user?.uid) return;

    const extensionOk = /\.(png|jpe?g)$/i.test(file.name);
    if (!avatarFileTypes.includes(file.type) && !extensionOk) {
      setUploadError("Use a PNG, JPEG, or JPG image.");
      return;
    }

    try {
      setSaving(true);
      setUploadError("");
      const avatarDataUrl = await createAvatarDataUrl(file);
      const nextProfile = await updateUserPersonalization(user.uid, {
        avatarDataUrl,
        photoURL: avatarDataUrl,
        name: profile?.name || user?.displayName?.split(" ")[0] || "Student"
      });
      onProfileUpdate?.(nextProfile);
    } catch (error) {
      setUploadError(error.message || "Could not update profile image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-avatar-menu" ref={menuRef}>
      <motion.button
        className="profile-avatar-trigger"
        type="button"
        aria-label="Open profile menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
      >
        <img src={avatarSrc} alt="" />
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="profile-avatar-card"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            <div className="profile-avatar-preview">
              <img src={avatarSrc} alt="" />
              <button
                type="button"
                aria-label="Change profile picture"
                onClick={() => inputRef.current?.click()}
                disabled={saving}
              >
                <Pencil size={14} />
              </button>
            </div>
            <div className="profile-avatar-copy">
              <strong>{displayName}</strong>
              <span>{modeLabel}</span>
            </div>
            <button
              className="profile-avatar-upload"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={saving}
            >
              <ImagePlus size={15} />
              <span>{saving ? "Updating..." : "Edit photo"}</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              onChange={handleAvatarFile}
            />
            {uploadError ? <p className="profile-avatar-error">{uploadError}</p> : null}
            <SynapseUsageCard usage={usage} secondsToReset={secondsToReset} usageError={usageError} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
