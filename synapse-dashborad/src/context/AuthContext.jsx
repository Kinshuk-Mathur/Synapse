"use client";

import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  enableAuthPersistence,
  getFirebaseAuth,
  getGoogleProvider,
  hasFirebaseConfig,
  missingFirebaseConfigKeys
} from "../lib/firebase";
import { createUserProfile, getUserProfile } from "../services/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setError(`Missing Firebase environment variables: ${missingFirebaseConfigKeys.join(", ")}`);
      setProfileLoading(false);
      setLoading(false);
      return undefined;
    }

    const firebaseAuth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (currentUser) => {
        try {
          if (currentUser) {
            setProfileLoading(true);
            const syncedProfile = await createUserProfile(currentUser);
            setProfile(syncedProfile);
          } else {
            setProfile(null);
          }

          setUser(currentUser);
          setError(null);
        } catch (authError) {
          setError(authError.message || "Unable to sync your SYNAPSE profile.");
        } finally {
          setProfileLoading(false);
          setLoading(false);
        }
      },
      (authError) => {
        setError(authError.message || "Authentication state failed.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      await enableAuthPersistence();
      const result = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
      const syncedProfile = await createUserProfile(result.user);
      setUser(result.user);
      setProfile(syncedProfile);
      return {
        user: result.user,
        profile: syncedProfile
      };
    } catch (authError) {
      setError(authError.message || "Google sign in failed.");
      throw authError;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await signOut(getFirebaseAuth());
      setUser(null);
      setProfile(null);
    } catch (authError) {
      setError(authError.message || "Logout failed.");
      throw authError;
    }
  };

  const refreshProfile = async () => {
    if (!user?.uid) {
      setProfile(null);
      return null;
    }

    setProfileLoading(true);

    try {
      const nextProfile = await getUserProfile(user.uid);
      setProfile(nextProfile);
      return nextProfile;
    } finally {
      setProfileLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      profileLoading,
      error,
      isAuthenticated: Boolean(user),
      loginWithGoogle,
      logout,
      refreshProfile,
      setProfile
    }),
    [user, profile, loading, profileLoading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
