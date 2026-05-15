import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "SYNAPSE | Todo Command Center",
  description: "A premium AI-powered todo workspace for student productivity.",
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
