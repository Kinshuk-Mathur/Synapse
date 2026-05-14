import "./globals.css";

export const metadata = {
  title: "SYNAPSE | AI Productivity Dashboard",
  description: "A premium AI productivity dashboard website for students."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
