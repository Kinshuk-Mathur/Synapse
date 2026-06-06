"use client";

import { AuthProvider } from "../context/AuthContext";
import { NotificationsProvider } from "../context/NotificationsContext";
import CustomCursor from "../components/CustomCursor";

export default function Providers({ children }) {
  return (
    <>
      <CustomCursor />
      <AuthProvider>
        <NotificationsProvider>{children}</NotificationsProvider>
      </AuthProvider>
    </>
  );
}
