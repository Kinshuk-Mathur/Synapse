"use client";

import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth, enableAuthPersistence, googleProvider } from "../lib/firebase";
import { createUserProfile } from "../services/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        try {
          if (currentUser) {
            await createUserProfile(currentUser);
          }

          setUser(currentUser);
          setError(null);
        } catch (authError) {
          setError(authError.message || "Unable to sync your SYNAPSE profile.");
        } finally {
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
      const result = await signInWithPopup(auth, googleProvider);
      await createUserProfile(result.user);
      setUser(result.user);
      return result.user;
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
      await signOut(auth);
      setUser(null);
    } catch (authError) {
      setError(authError.message || "Logout failed.");
      throw authError;
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: Boolean(user),
      loginWithGoogle,
      logout
    }),
    [user, loading, error]
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
