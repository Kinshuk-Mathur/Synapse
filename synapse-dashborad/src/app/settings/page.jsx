"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import {
  CURRENT_CONSENT_VERSION,
  hasCurrentConsent,
  updateUserPersonalization
} from "../../services/firestore";

const themeOptions = [
  {
    id: "obsidian",
    name: "Obsidian Neon",
    description: "Violet and magenta glow"
  },
  {
    id: "midnight",
    name: "Midnight Tech",
    description: "Cool indigo workspace"
  },
  {
    id: "inferno",
    name: "Inferno Focus",
    description: "Warm red-orange focus"
  },
  {
    id: "pink",
    name: "Pink Aura",
    description: "Soft creative bloom"
  }
];

const subjectOptions = ["Physics", "Chemistry", "Maths", "Biology", "Computer Science", "English"];
const educationOptions = ["Class 9", "Class 10", "Class 11 PCM", "Class 12 PCM", "JEE", "NEET", "College", "Coding", "Self Learning"];
const goalOptions = ["Boards", "JEE", "NEET", "Coding", "Productivity", "Skill Learning", "Startup Building"];
const learningOptions = ["Step-by-step", "Visual explanations", "Deep concepts", "Short summaries", "Analogies", "Practice questions"];
const timeOptions = ["Morning", "Afternoon", "Night"];
const problemOptions = ["Phone distractions", "Procrastination", "Burnout", "Confusion", "Lack of consistency"];
const toneOptions = ["Friendly", "Motivational", "Strict mentor", "Professional", "Simple teacher"];

const defaultForm = {
  name: "",
  educationLevel: [],
  mainGoal: [],
  strongSubjects: [],
  weakSubjects: [],
  learningStyle: [],
  productiveTime: [],
  biggestProblem: [],
  aiTone: []
};

function toSelectionArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function normalizeOtherValue(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

function normalizeTheme(theme) {
  return (
    {
      "obsidian-neon": "obsidian",
      "midnight-tech": "midnight",
      "inferno-focus": "inferno",
      "pink-aura": "pink"
    }[theme] || theme || "obsidian"
  );
}

function toConsentDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatConsentDate(profile) {
  const acceptedDate = toConsentDate(
    profile?.privacyAcceptedAt ||
      profile?.termsAcceptedAt ||
      profile?.chatStorageConsentAt ||
      profile?.mediaProcessingConsentAt ||
      profile?.personalizationConsentAt
  );

  if (!acceptedDate) return "Not available";

  return acceptedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function ThemeSelector({ value, onChange }) {
  return (
    <section className="settings-field settings-theme-field">
      <h2>Workspace theme</h2>
      <div className="settings-theme-grid">
        {themeOptions.map((theme) => (
          <motion.button
            key={theme.id}
            type="button"
            className={`settings-theme-option ${value === theme.id ? "is-selected" : ""}`}
            data-theme-preview={theme.id}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onChange(theme.id)}
          >
            <span className="settings-theme-preview" aria-hidden="true">
              <i />
              <b />
            </span>
            <span className="settings-theme-copy">
              <strong>{theme.name}</strong>
              <small>{theme.description}</small>
            </span>
            {value === theme.id ? <Check size={16} /> : null}
          </motion.button>
        ))}
      </div>
    </section>
  );
}

function ChipGroup({ label, value, options, onChange }) {
  const selectedValues = toSelectionArray(value);
  const [otherValue, setOtherValue] = useState("");

  const toggleValue = (option) => {
    const next = new Set(selectedValues);
    if (next.has(option)) {
      next.delete(option);
    } else {
      next.add(option);
    }

    onChange(Array.from(next));
  };

  const addOther = () => {
    const nextValue = normalizeOtherValue(otherValue);

    if (!nextValue) return;

    onChange(Array.from(new Set([...selectedValues, nextValue])));
    setOtherValue("");
  };

  return (
    <section className="settings-field">
      <h2>{label}</h2>
      <div className="settings-chip-grid is-multi">
        {options.map((option) => {
          const selected = selectedValues.includes(option);

          return (
            <motion.button
              key={option}
              type="button"
              className={selected ? "is-selected" : ""}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => toggleValue(option)}
            >
              <span>{option}</span>
              {selected ? <Check size={15} /> : null}
            </motion.button>
          );
        })}
        {selectedValues
          .filter((option) => !options.includes(option))
          .map((option) => (
            <motion.button
              key={option}
              type="button"
              className="is-selected is-custom"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onChange(selectedValues.filter((item) => item !== option))}
            >
              <span>{option}</span>
              <Check size={15} />
            </motion.button>
          ))}
        <label className="settings-other-input">
          <input
            value={otherValue}
            onChange={(event) => setOtherValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addOther();
              }
            }}
            maxLength={24}
            placeholder="Other (1-2 words)"
          />
          <button type="button" onClick={addOther}>
            Add
          </button>
        </label>
      </div>
    </section>
  );
}

function PrivacyConsentSummary({ profile }) {
  const currentConsent = hasCurrentConsent(profile);
  const status = currentConsent ? "Accepted" : profile?.consentCompleted ? "Update required" : "Not accepted";

  return (
    <section className="settings-consent-summary">
      <div className="settings-consent-heading">
        <span>
          <ShieldCheck size={16} />
        </span>
        <div>
          <h2>Privacy & Consent</h2>
          <p>Consent details for your SYNAPSE account.</p>
        </div>
      </div>
      <div className="settings-consent-meta">
        <span>Version</span>
        <strong>{profile?.consentVersion || CURRENT_CONSENT_VERSION}</strong>
        <span>Accepted</span>
        <strong>{formatConsentDate(profile)}</strong>
        <span>Status</span>
        <strong>{status}</strong>
      </div>
    </section>
  );
}

function DeleteAccountPlaceholder() {
  return (
    <section className="settings-delete-placeholder">
      <div>
        <Trash2 size={17} />
        <h2>Delete Account</h2>
      </div>
      <p>Account deletion and data removal controls will be added here.</p>
      <button type="button" disabled>
        Coming soon
      </button>
    </section>
  );
}

function SettingsContent() {
  const { user, profile, setProfile } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("obsidian");

  useEffect(() => {
    const savedTheme = normalizeTheme(window.localStorage.getItem("synapse-theme"));
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    window.localStorage.setItem("synapse-theme", savedTheme);
  }, []);

  useEffect(() => {
    if (!profile) return;

    setForm({
      name: profile.name || profile.displayName?.split(" ")[0] || "",
      educationLevel: toSelectionArray(profile.educationLevel),
      mainGoal: toSelectionArray(profile.mainGoal),
      strongSubjects: toSelectionArray(profile.strongSubjects),
      weakSubjects: toSelectionArray(profile.weakSubjects),
      learningStyle: toSelectionArray(profile.learningStyle),
      productiveTime: toSelectionArray(profile.productiveTime),
      biggestProblem: toSelectionArray(profile.biggestProblem),
      aiTone: toSelectionArray(profile.aiTone)
    });
  }, [profile]);

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const applyTheme = (nextTheme) => {
    const normalizedTheme = normalizeTheme(nextTheme);
    setTheme(normalizedTheme);
    document.documentElement.dataset.theme = normalizedTheme;
    window.localStorage.setItem("synapse-theme", normalizedTheme);
    window.dispatchEvent(new CustomEvent("synapse-theme-change", { detail: { theme: normalizedTheme } }));
  };

  const saveSettings = async () => {
    if (!user?.uid) return;

    try {
      setSaving(true);
      setStatus("");
      setError("");
      const nextProfile = await updateUserPersonalization(user.uid, {
        name: form.name.trim() || profile?.displayName?.split(" ")[0] || "Student",
        educationLevel: toSelectionArray(form.educationLevel),
        mainGoal: toSelectionArray(form.mainGoal),
        strongSubjects: toSelectionArray(form.strongSubjects),
        weakSubjects: toSelectionArray(form.weakSubjects),
        learningStyle: toSelectionArray(form.learningStyle),
        productiveTime: toSelectionArray(form.productiveTime),
        biggestProblem: toSelectionArray(form.biggestProblem),
        aiTone: toSelectionArray(form.aiTone)
      });

      setProfile(nextProfile);
      setStatus("Personalization updated.");
    } catch (saveError) {
      setError(saveError.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-page">
      <div className="ambient-grid" aria-hidden="true" />

      <section className="settings-shell">
        <header className="settings-header">
          <Link href="/" className="settings-back-link">
            <ArrowLeft size={17} />
            Dashboard
          </Link>
          <Link href="/" aria-label="Go to SYNAPSE dashboard">
            <Image src="/assets/main-logo.jpeg" alt="SYNAPSE" width={158} height={62} className="settings-logo" />
          </Link>
          <button className="settings-save-button" type="button" onClick={saveSettings} disabled={saving}>
            {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            Save
          </button>
        </header>

        <motion.div
          className="settings-hero-panel"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span>
            <Sparkles size={15} />
            AI personalization
          </span>
          <h1>Shape how SYNAPSE thinks with you.</h1>
          <p>
            Your weak subjects, learning style, focus rhythm, and tone guide every AI response and dashboard signal.
          </p>
        </motion.div>

        <div className="settings-grid">
          <div className="settings-side-stack">
            <motion.section
              className="settings-card settings-name-card"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
            >
              <h2>What should SYNAPSE call you?</h2>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Your name"
              />
            </motion.section>

            <motion.section
              className="settings-card settings-consent-card"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 }}
            >
              <PrivacyConsentSummary profile={profile} />
            </motion.section>

            <motion.section
              className="settings-card settings-delete-card"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.11 }}
            >
              <DeleteAccountPlaceholder />
            </motion.section>
          </div>

          <motion.section
            className="settings-card settings-fields-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            <ThemeSelector value={theme} onChange={applyTheme} />
            <ChipGroup
              label="Education level"
              value={form.educationLevel}
              options={educationOptions}
              onChange={(value) => updateField("educationLevel", value)}
            />
            <ChipGroup
              label="Main goal"
              value={form.mainGoal}
              options={goalOptions}
              onChange={(value) => updateField("mainGoal", value)}
            />
            <ChipGroup
              label="Strong subjects"
              value={form.strongSubjects}
              options={subjectOptions}
              onChange={(value) => updateField("strongSubjects", value)}
            />
            <ChipGroup
              label="Weak subjects"
              value={form.weakSubjects}
              options={subjectOptions}
              onChange={(value) => updateField("weakSubjects", value)}
            />
            <ChipGroup
              label="Learning style"
              value={form.learningStyle}
              options={learningOptions}
              onChange={(value) => updateField("learningStyle", value)}
            />
            <ChipGroup
              label="Productive time"
              value={form.productiveTime}
              options={timeOptions}
              onChange={(value) => updateField("productiveTime", value)}
            />
            <ChipGroup
              label="Biggest study blocker"
              value={form.biggestProblem}
              options={problemOptions}
              onChange={(value) => updateField("biggestProblem", value)}
            />
            <ChipGroup
              label="AI tone"
              value={form.aiTone}
              options={toneOptions}
              onChange={(value) => updateField("aiTone", value)}
            />
          </motion.section>
        </div>

        <AnimatePresence>
          {status || error ? (
            <motion.p
              className={`settings-toast ${error ? "is-error" : ""}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
            >
              {error || status}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
