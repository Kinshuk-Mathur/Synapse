"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Save, Sparkles } from "lucide-react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import { updateUserPersonalization } from "../../services/firestore";

const subjectOptions = ["Physics", "Chemistry", "Maths", "Biology", "Computer Science", "English"];
const educationOptions = ["Class 9", "Class 10", "Class 11 PCM", "Class 12 PCM", "JEE", "NEET", "College", "Coding", "Self Learning"];
const goalOptions = ["Boards", "JEE", "NEET", "Coding", "Productivity", "Skill Learning", "Startup Building"];
const learningOptions = ["Step-by-step", "Visual explanations", "Deep concepts", "Short summaries", "Analogies", "Practice questions"];
const timeOptions = ["Morning", "Afternoon", "Night"];
const problemOptions = ["Phone distractions", "Procrastination", "Burnout", "Confusion", "Lack of consistency"];
const toneOptions = ["Friendly", "Motivational", "Strict mentor", "Professional", "Simple teacher"];

const defaultForm = {
  name: "",
  educationLevel: "",
  mainGoal: "",
  strongSubjects: [],
  weakSubjects: [],
  learningStyle: "",
  productiveTime: "",
  biggestProblem: "",
  aiTone: ""
};

function ChipGroup({ label, value, options, multi = false, onChange }) {
  const selectedValues = Array.isArray(value) ? value : [value].filter(Boolean);

  return (
    <section className="settings-field">
      <h2>{label}</h2>
      <div className={`settings-chip-grid ${multi ? "is-multi" : ""}`}>
        {options.map((option) => {
          const selected = selectedValues.includes(option);

          return (
            <motion.button
              key={option}
              type="button"
              className={selected ? "is-selected" : ""}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (!multi) {
                  onChange(option);
                  return;
                }

                const next = new Set(selectedValues);
                if (next.has(option)) {
                  next.delete(option);
                } else {
                  next.add(option);
                }

                onChange(Array.from(next));
              }}
            >
              <span>{option}</span>
              {selected ? <Check size={15} /> : null}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

function SettingsContent() {
  const { user, profile, setProfile } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;

    setForm({
      name: profile.name || profile.displayName?.split(" ")[0] || "",
      educationLevel: profile.educationLevel || "",
      mainGoal: profile.mainGoal || "",
      strongSubjects: Array.isArray(profile.strongSubjects) ? profile.strongSubjects : [],
      weakSubjects: Array.isArray(profile.weakSubjects) ? profile.weakSubjects : [],
      learningStyle: profile.learningStyle || "",
      productiveTime: profile.productiveTime || "",
      biggestProblem: profile.biggestProblem || "",
      aiTone: profile.aiTone || ""
    });
  }, [profile]);

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const saveSettings = async () => {
    if (!user?.uid) return;

    try {
      setSaving(true);
      setStatus("");
      setError("");
      const nextProfile = await updateUserPersonalization(user.uid, {
        name: form.name.trim() || profile?.displayName?.split(" ")[0] || "Student",
        educationLevel: form.educationLevel,
        mainGoal: form.mainGoal,
        strongSubjects: form.strongSubjects,
        weakSubjects: form.weakSubjects,
        learningStyle: form.learningStyle,
        productiveTime: form.productiveTime,
        biggestProblem: form.biggestProblem,
        aiTone: form.aiTone
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
          <Image src="/assets/main-logo.jpeg" alt="SYNAPSE" width={158} height={62} className="settings-logo" />
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
            className="settings-card settings-fields-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
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
              multi
              onChange={(value) => updateField("strongSubjects", value)}
            />
            <ChipGroup
              label="Weak subjects"
              value={form.weakSubjects}
              options={subjectOptions}
              multi
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
