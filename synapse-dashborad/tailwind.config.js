/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--color-bg)",
        surface: "var(--color-surface)",
        panel: "var(--panel)",
        text: "var(--color-text)",
        muted: "var(--color-muted)",
        accent: "var(--color-accent)",
        pulse: "var(--color-pulse)",
        gold: "var(--color-gold)",
        sky: "var(--color-sky)",
        lime: "var(--color-lime)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        card: "var(--shadow-card)"
      }
    }
  },
  plugins: []
};
