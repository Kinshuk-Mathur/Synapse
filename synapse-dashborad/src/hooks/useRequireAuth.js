"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { hasCurrentConsent } from "../services/firestore";

export function useRequireAuth(options = {}) {
  const { requireOnboarding = true, requireConsent = true } = options;
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }

    if (
      requireConsent &&
      !loading &&
      !profileLoading &&
      user &&
      !hasCurrentConsent(profile) &&
      pathname !== "/consent"
    ) {
      router.replace(`/consent?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    if (
      requireOnboarding &&
      !loading &&
      !profileLoading &&
      user &&
      !profile?.onboardingCompleted &&
      pathname !== "/onboarding"
    ) {
      router.replace(`/onboarding?next=${encodeURIComponent(pathname || "/")}`);
    }
  }, [loading, pathname, profile, profileLoading, requireConsent, requireOnboarding, router, user]);

  const consentReady = !requireConsent || hasCurrentConsent(profile) || pathname === "/consent";
  const onboardingReady =
    !requireOnboarding || Boolean(profile?.onboardingCompleted) || pathname === "/onboarding";

  return {
    user,
    profile,
    loading: loading || profileLoading,
    isAllowed: Boolean(user) && !loading && !profileLoading && consentReady && onboardingReady
  };
}
