"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateUserPersonalization } from "../services/firestore";

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

export default function ProfileAvatarMenu({
  user,
  profile,
  studentName = "Student",
  modeLabel = "Focus Mode",
  onProfileUpdate
}) {
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const avatarSrc = profile?.avatarDataUrl || profile?.photoURL || user?.photoURL || "/assets/synapse-icon-cropped.png";
  const displayName = profile?.name || profile?.displayName || user?.displayName || studentName || "Student";

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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
