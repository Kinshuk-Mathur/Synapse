import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "SYNAPSE | AI Productivity Dashboard",
  description: "A premium AI productivity dashboard website for students.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
