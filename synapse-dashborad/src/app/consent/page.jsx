"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import {
  CURRENT_CONSENT_VERSION,
  hasCurrentConsent,
  saveUserConsent
} from "../../services/firestore";

const consentItems = [
  {
    id: "privacyAccepted",
    text: "I have read and agree to the",
    linkLabel: "Privacy Policy.",
    href: "/privacy"
  },
  {
    id: "termsAccepted",
    text: "I agree to the",
    linkLabel: "Terms of Service.",
    href: "/terms"
  },
  {
    id: "chatStorageConsent",
    text: "I consent to SYNAPSE storing my AI conversations to provide chat history, memory, and personalized assistance."
  },
  {
    id: "mediaProcessingConsent",
    text: "I consent to SYNAPSE processing uploaded PDFs and voice interactions to generate summaries, answers, and study assistance."
  },
  {
    id: "personalizationConsent",
    text: "I consent to personalized recommendations, study plans, productivity insights, and AI coaching based on my activity within SYNAPSE."
  }
];

const initialConsentState = consentItems.reduce((state, item) => {
  state[item.id] = false;
  return state;
}, {});

function getNextPath(searchParams) {
  const requestedPath = searchParams.get("next") || "/";
  return requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
}

function ConsentContent() {
  const { user, profile, setProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getNextPath(searchParams);
  const [checked, setChecked] = useState(initialConsentState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const allAccepted = consentItems.every((item) => checked[item.id]);

  const continuePath = useMemo(
    () => (profile?.onboardingCompleted ? nextPath : `/onboarding?next=${encodeURIComponent(nextPath)}`),
    [nextPath, profile?.onboardingCompleted]
  );

  useEffect(() => {
    if (profile && hasCurrentConsent(profile)) {
      router.replace(continuePath);
    }
  }, [continuePath, profile, router]);

  const toggleConsent = (id) => {
    setChecked((current) => ({
      ...current,
      [id]: !current[id]
    }));
  };

  const acceptConsent = async () => {
    if (!user?.uid || !allAccepted || saving) return;

    try {
      setSaving(true);
      setError("");
      const nextProfile = await saveUserConsent(user.uid);
      setProfile(nextProfile);
      router.replace(
        nextProfile?.onboardingCompleted ? nextPath : `/onboarding?next=${encodeURIComponent(nextPath)}`
      );
    } catch (saveError) {
      setError(saveError.message || "Could not save your consent preferences yet.");
      setSaving(false);
    }
  };

  return (
    <main className="consent-page">
      <div className="ambient-grid" aria-hidden="true" />

      <motion.section
        className="consent-card"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42 }}
      >
        <header className="consent-header">
          <Image
            src="/assets/main-logo.jpeg"
            alt="SYNAPSE"
            width={176}
            height={70}
            className="consent-logo"
            priority
          />
          <span className="consent-version-badge">
            <ShieldCheck size={15} />
            Version {CURRENT_CONSENT_VERSION}
          </span>
        </header>

        <div className="consent-title-block">
          <h1>Privacy & Data Preferences</h1>
          <p>
            To provide personalized learning, goal tracking, AI assistance, and productivity insights,
            SYNAPSE needs your permission to securely store and process certain information.
          </p>
          <p>Please review and accept the following before continuing.</p>
        </div>

        <fieldset className="consent-checklist">
          <legend>Required consent</legend>
          {consentItems.map((item) => (
            <label className="consent-checkbox-row" key={item.id}>
              <input
                type="checkbox"
                checked={checked[item.id]}
                onChange={() => toggleConsent(item.id)}
              />
              <span className="consent-check-visual" aria-hidden="true">
                {checked[item.id] ? <Check size={16} /> : null}
              </span>
              <span>
                {item.text}{" "}
                {item.href ? (
                  <Link href={item.href} target="_blank">
                    {item.linkLabel}
                  </Link>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        <section className="consent-info-box">
          <h2>What data do we store?</h2>
          <ul>
            <li>Account information (email and profile)</li>
            <li>Goals and productivity data</li>
            <li>AI conversations</li>
            <li>Uploaded study materials</li>
            <li>Voice interactions (when used)</li>
          </ul>
          <p>We never sell your personal information.</p>
          <p>You can request account deletion and data removal at any time.</p>
        </section>

        {error ? <p className="consent-error">{error}</p> : null}

        <button
          className="consent-continue-button"
          type="button"
          disabled={!allAccepted || saving}
          onClick={acceptConsent}
        >
          {saving ? <Loader2 className="spin" size={18} /> : null}
          Accept & Continue
          {!saving ? <ArrowRight size={18} /> : null}
        </button>
      </motion.section>
    </main>
  );
}

export default function ConsentPage() {
  return (
    <ProtectedRoute requireOnboarding={false}>
      <Suspense
        fallback={
          <main className="auth-screen">
            <span className="auth-loader" />
          </main>
        }
      >
        <ConsentContent />
      </Suspense>
    </ProtectedRoute>
  );
}
