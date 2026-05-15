"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

function LoginContent() {
  const { user, loading, error, loginWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("next") || "/";
  const nextPath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath);
    }
  }, [loading, nextPath, router, user]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await loginWithGoogle();
      router.replace(nextPath);
    } catch {
      // AuthContext owns the user-facing error state.
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <main className="login-page">
      <div className="ambient-grid" aria-hidden="true" />
      <motion.section
        className="login-card"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45 }}
      >
        <Image
          src="/assets/main-logo.jpeg"
          alt="SYNAPSE"
          width={260}
          height={102}
          className="login-logo"
          priority
        />

        <div className="login-badge">
          <Sparkles size={16} />
          AI Productivity OS
        </div>

        <h1>Enter your focus command center.</h1>
        <p>
          Sign in to sync your todos, goals, focus sessions, and analytics across SYNAPSE.
        </p>

        <button
          className="google-login-button"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading || isSigningIn}
        >
          <span className="google-mark">G</span>
          {isSigningIn ? "Connecting..." : "Continue with Google"}
          {isSigningIn ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
        </button>

        {error ? <p className="auth-error">{error}</p> : null}

        <div className="login-trust-row">
          <span>
            <ShieldCheck size={16} />
            Persistent secure session
          </span>
          <span>Firestore ready</span>
        </div>
      </motion.section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-screen">
          <span className="auth-loader" />
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
