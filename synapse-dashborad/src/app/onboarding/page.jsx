"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft, Loader2, Sparkles } from "lucide-react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import { saveUserOnboarding } from "../../services/firestore";

const subjectOptions = ["Physics", "Chemistry", "Maths", "Biology", "Computer Science", "English"];

const steps = [
  {
    key: "name",
    eyebrow: "Identity",
    question: "What should SYNAPSE call you?",
    type: "text",
    placeholder: "Enter your name"
  },
  {
    key: "educationLevel",
    eyebrow: "Study stage",
    question: "What are you currently studying?",
    type: "single",
    options: ["Class 9", "Class 10", "Class 11 PCM", "Class 12 PCM", "JEE", "NEET", "College", "Coding", "Self Learning"]
  },
  {
    key: "mainGoal",
    eyebrow: "Direction",
    question: "What are you preparing for?",
    type: "single",
    options: ["Boards", "JEE", "NEET", "Coding", "Productivity", "Skill Learning", "Startup Building"]
  },
  {
    key: "strongSubjects",
    eyebrow: "Strengths",
    question: "Which subjects are your strengths?",
    type: "multi",
    options: subjectOptions
  },
  {
    key: "weakSubjects",
    eyebrow: "Attention areas",
    question: "What subjects do you struggle with?",
    type: "multi",
    options: subjectOptions
  },
  {
    key: "learningStyle",
    eyebrow: "Learning mode",
    question: "How do you learn best?",
    type: "single",
    options: ["Step-by-step", "Visual explanations", "Deep concepts", "Short summaries", "Analogies", "Practice questions"]
  },
  {
    key: "productiveTime",
    eyebrow: "Focus rhythm",
    question: "When are you most productive?",
    type: "single",
    options: ["Morning", "Afternoon", "Night"]
  },
  {
    key: "biggestProblem",
    eyebrow: "Friction",
    question: "What usually stops you from studying?",
    type: "single",
    options: ["Phone distractions", "Procrastination", "Burnout", "Confusion", "Lack of consistency"]
  },
  {
    key: "aiTone",
    eyebrow: "Assistant style",
    question: "How should SYNAPSE talk to you?",
    type: "single",
    options: ["Friendly", "Motivational", "Strict mentor", "Professional", "Simple teacher"]
  }
];

const initialAnswers = {
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

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function OnboardingContent() {
  const { user, profile, setProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("next") || "/";
  const nextPath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const step = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  useEffect(() => {
    if (!profile) return;

    setAnswers((current) => ({
      ...current,
      name: profile.name || profile.displayName?.split(" ")[0] || current.name,
      educationLevel: profile.educationLevel || current.educationLevel,
      mainGoal: profile.mainGoal || current.mainGoal,
      strongSubjects: Array.isArray(profile.strongSubjects) ? profile.strongSubjects : current.strongSubjects,
      weakSubjects: Array.isArray(profile.weakSubjects) ? profile.weakSubjects : current.weakSubjects,
      learningStyle: profile.learningStyle || current.learningStyle,
      productiveTime: profile.productiveTime || current.productiveTime,
      biggestProblem: profile.biggestProblem || current.biggestProblem,
      aiTone: profile.aiTone || current.aiTone
    }));
  }, [profile]);

  useEffect(() => {
    if (profile?.onboardingCompleted) {
      router.replace(nextPath);
    }
  }, [nextPath, profile, router]);

  const canContinue = useMemo(() => {
    const value = answers[step.key];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || "").trim());
  }, [answers, step.key]);

  const updateSingle = (value) => {
    setAnswers((current) => ({
      ...current,
      [step.key]: value
    }));
  };

  const toggleMulti = (value) => {
    setAnswers((current) => {
      const selected = new Set(current[step.key] || []);

      if (selected.has(value)) {
        selected.delete(value);
      } else {
        selected.add(value);
      }

      return {
        ...current,
        [step.key]: Array.from(selected)
      };
    });
  };

  const completeOnboarding = async () => {
    if (!user?.uid) return;

    try {
      setSaving(true);
      setError("");
      const [nextProfile] = await Promise.all([
        saveUserOnboarding(user.uid, {
          name: answers.name.trim(),
          educationLevel: answers.educationLevel,
          mainGoal: answers.mainGoal,
          strongSubjects: answers.strongSubjects,
          weakSubjects: answers.weakSubjects,
          learningStyle: answers.learningStyle,
          productiveTime: answers.productiveTime,
          biggestProblem: answers.biggestProblem,
          aiTone: answers.aiTone
        }),
        wait(1200)
      ]);

      setProfile(nextProfile);
      router.replace(nextPath);
    } catch (saveError) {
      setError(saveError.message || "Could not personalize SYNAPSE yet.");
      setSaving(false);
    }
  };

  const next = () => {
    if (!canContinue || saving) return;

    if (stepIndex === steps.length - 1) {
      completeOnboarding();
      return;
    }

    setStepIndex((current) => current + 1);
  };

  return (
    <main className="onboarding-page">
      <div className="ambient-grid" aria-hidden="true" />
      <motion.div
        className="onboarding-shell"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <header className="onboarding-header">
          <Image
            src="/assets/main-logo.jpeg"
            alt="SYNAPSE"
            width={176}
            height={70}
            className="onboarding-logo"
            priority
          />
          <div className="onboarding-progress">
            <span>{saving ? "Finalizing" : `Step ${stepIndex + 1} of ${steps.length}`}</span>
            <div>
              <motion.i animate={{ width: saving ? "100%" : `${progress}%` }} transition={{ duration: 0.35 }} />
            </div>
          </div>
        </header>

        <section className="onboarding-stage">
          <AnimatePresence mode="wait">
            {saving ? (
              <motion.article
                key="saving"
                className="onboarding-card onboarding-saving-card"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.98 }}
                transition={{ duration: 0.32 }}
              >
                <span className="onboarding-loader">
                  <Loader2 size={34} />
                </span>
                <strong>Building your personalized workspace...</strong>
                <p>SYNAPSE is tuning your AI style, study rhythm, weak subjects, and dashboard signals.</p>
              </motion.article>
            ) : (
              <motion.article
                key={step.key}
                className="onboarding-card"
                initial={{ opacity: 0, x: 34, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -24, scale: 0.98 }}
                transition={{ duration: 0.28 }}
              >
                <span className="onboarding-eyebrow">
                  <Sparkles size={15} />
                  {step.eyebrow}
                </span>
                <h1>{step.question}</h1>

                {step.type === "text" ? (
                  <label className="onboarding-input">
                    <input
                      autoFocus
                      value={answers.name}
                      onChange={(event) =>
                        setAnswers((current) => ({ ...current, name: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") next();
                      }}
                      placeholder={step.placeholder}
                    />
                  </label>
                ) : (
                  <div className={`onboarding-options ${step.type === "multi" ? "is-multi" : ""}`}>
                    {step.options.map((option) => {
                      const selected =
                        step.type === "multi"
                          ? answers[step.key].includes(option)
                          : answers[step.key] === option;

                      return (
                        <motion.button
                          key={option}
                          type="button"
                          className={selected ? "is-selected" : ""}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => (step.type === "multi" ? toggleMulti(option) : updateSingle(option))}
                        >
                          <span>{option}</span>
                          {selected ? <Check size={16} /> : null}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {step.type === "multi" ? (
                  <p className="onboarding-hint">Choose one or more. You can edit this later in Settings.</p>
                ) : null}

                {error ? <p className="onboarding-error">{error}</p> : null}
              </motion.article>
            )}
          </AnimatePresence>
        </section>

        {!saving ? (
          <footer className="onboarding-actions">
            <button
              type="button"
              className="onboarding-back"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={17} />
              Back
            </button>
            <button type="button" className="onboarding-next" disabled={!canContinue} onClick={next}>
              {stepIndex === steps.length - 1 ? "Build workspace" : "Continue"}
              <ArrowRight size={17} />
            </button>
          </footer>
        ) : null}
      </motion.div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <ProtectedRoute requireOnboarding={false}>
      <Suspense
        fallback={
          <main className="auth-screen">
            <span className="auth-loader" />
          </main>
        }
      >
        <OnboardingContent />
      </Suspense>
    </ProtectedRoute>
  );
}
