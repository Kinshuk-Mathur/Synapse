"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export function useRequireAuth(options = {}) {
  const { requireOnboarding = true } = options;
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
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
  }, [loading, pathname, profile, profileLoading, requireOnboarding, router, user]);

  const onboardingReady =
    !requireOnboarding || Boolean(profile?.onboardingCompleted) || pathname === "/onboarding";

  return {
    user,
    profile,
    loading: loading || profileLoading,
    isAllowed: Boolean(user) && !loading && !profileLoading && onboardingReady
  };
}
