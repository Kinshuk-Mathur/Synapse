"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, ImagePlus, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSynapseUsage } from "../hooks/useSynapseUsage";
import { updateUserPersonalization } from "../services/firestore";

const avatarFileTypes = ["image/png", "image/jpeg"];
const ringRadius = 25;
const ringCircumference = 2 * Math.PI * ringRadius;

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

function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

function getUsageToneClass(remainingPercent) {
  if (remainingPercent <= 10) return "is-critical";
  if (remainingPercent <= 40) return "is-warning";
  if (remainingPercent <= 75) return "is-moderate";
  return "is-healthy";
}

function formatResetTime(totalMinutes = 0) {
  const safeMinutes = Math.max(0, Math.ceil(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function getResetStatus(hasActiveWindow, minutesUntilReset) {
  if (!hasActiveWindow) {
    return {
      label: "Start chatting to begin session",
      urgent: false
    };
  }

  return {
    label: `Resets in ${formatResetTime(minutesUntilReset)}`,
    urgent: minutesUntilReset <= 5
  };
}

function getInitials(name = "Student") {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "S";
}

function AvatarMedia({ src, displayName }) {
  if (src) {
    return <img src={src} alt="" />;
  }

  return <span className="profile-avatar-initials">{getInitials(displayName)}</span>;
}

function UsageBar({ percent, toneClass }) {
  return (
    <div className="profile-usage-bar" aria-hidden="true">
      <motion.span
        className={`profile-usage-bar-fill ${toneClass}`}
        initial={false}
        animate={{ width: `${clampPercent(percent)}%` }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      />
    </div>
  );
}

function UsageRing({ remainingPercent, toneClass }) {
  const safeRemaining = clampPercent(remainingPercent);
  const strokeDashoffset = ringCircumference * (1 - safeRemaining / 100);

  return (
    <svg className="profile-usage-ring-svg" viewBox="0 0 58 58" aria-hidden="true">
      <circle className="profile-usage-ring-track" cx="29" cy="29" r={ringRadius} />
      <motion.circle
        className={`profile-usage-ring-progress ${toneClass}`}
        cx="29"
        cy="29"
        r={ringRadius}
        initial={false}
        animate={{ strokeDashoffset }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ strokeDasharray: ringCircumference }}
      />
    </svg>
  );
}

function UsagePopover({ hasActiveWindow, minutesUntilReset, overallPercent, loading }) {
  const remainingPercent = clampPercent(100 - overallPercent);
  const overallToneClass = getUsageToneClass(remainingPercent);
  const resetStatus = getResetStatus(hasActiveWindow, minutesUntilReset);

  return (
    <motion.div
      className={`profile-usage-popover ${overallToneClass}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      aria-busy={loading}
    >
      <div className="profile-usage-popover-head">
        <strong>Session Usage</strong>
        <span style={resetStatus.urgent ? { color: "var(--color-pulse)" } : undefined}>
          <Clock size={13} />
          {resetStatus.label}
        </span>
      </div>

      <div className="profile-usage-overall">
        <div className="profile-usage-overall-copy">
          <span>Overall Usage</span>
          <strong>{overallPercent}% used</strong>
        </div>
        <UsageBar percent={overallPercent} toneClass={overallToneClass} />
        <div className="profile-usage-overall-meta">
          <span>{overallPercent}% used</span>
          <strong>{remainingPercent}% remaining</strong>
        </div>
      </div>

      <p>Limits reset every 6 hours</p>
    </motion.div>
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
  const [usagePopoverOpen, setUsagePopoverOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const openUsageTimerRef = useRef(null);
  const closeUsageTimerRef = useRef(null);
  const avatarSrc = profile?.avatarDataUrl || profile?.photoURL || user?.photoURL || "";
  const displayName = profile?.name || profile?.displayName || user?.displayName || studentName || "Student";
  const { hasActiveWindow, minutesUntilReset, overallPercent, loading } = useSynapseUsage(user?.uid);
  const remainingPercent = clampPercent(100 - overallPercent);
  const ringToneClass = getUsageToneClass(remainingPercent);

  useEffect(() => {
    if (!open) return undefined;

    const closeProfileMenu = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeProfileMenu);
    return () => window.removeEventListener("pointerdown", closeProfileMenu);
  }, [open]);

  useEffect(() => {
    return () => {
      window.clearTimeout(openUsageTimerRef.current);
      window.clearTimeout(closeUsageTimerRef.current);
    };
  }, []);

  const openUsagePopoverAfterDelay = () => {
    if (open || !window.matchMedia?.("(hover: hover)")?.matches) return;

    window.clearTimeout(closeUsageTimerRef.current);
    openUsageTimerRef.current = window.setTimeout(() => {
      setUsagePopoverOpen(true);
    }, 200);
  };

  const closeUsagePopoverAfterDelay = () => {
    window.clearTimeout(openUsageTimerRef.current);
    closeUsageTimerRef.current = window.setTimeout(() => {
      setUsagePopoverOpen(false);
    }, 300);
  };

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
    <div
      className="profile-avatar-menu"
      ref={menuRef}
      onMouseEnter={openUsagePopoverAfterDelay}
      onMouseLeave={closeUsagePopoverAfterDelay}
    >
      <motion.button
        className={`profile-avatar-trigger ${ringToneClass}`}
        type="button"
        aria-label="Open profile menu"
        aria-expanded={open}
        onClick={() => {
          setUsagePopoverOpen(false);
          setOpen((value) => !value);
        }}
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
      >
        <UsageRing remainingPercent={remainingPercent} toneClass={ringToneClass} />
        <AvatarMedia src={avatarSrc} displayName={displayName} />
      </motion.button>

      <AnimatePresence>
        {usagePopoverOpen && !open ? (
          <UsagePopover
            hasActiveWindow={hasActiveWindow}
            minutesUntilReset={minutesUntilReset}
            overallPercent={overallPercent}
            loading={loading}
          />
        ) : null}
      </AnimatePresence>

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
              <AvatarMedia src={avatarSrc} displayName={displayName} />
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
