"use client";

import { motion } from "framer-motion";
import { useRequireAuth } from "../hooks/useRequireAuth";

export default function ProtectedRoute({ children }) {
  const { isAllowed, loading } = useRequireAuth();

  if (loading || !isAllowed) {
    return (
      <main className="auth-screen">
        <motion.div
          className="auth-loading-card"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <span className="auth-loader" />
          <strong>Securing SYNAPSE</strong>
          <p>Checking your study OS session...</p>
        </motion.div>
      </main>
    );
  }

  return children;
}
