/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Branded palette — kept minimal so the UI feels professional, not toy.
        ink: {
          900: "#0b132b",
          700: "#1c2541",
          500: "#3a506b",
        },
        accent: {
          green: "#16a34a",
          red: "#dc2626",
          amber: "#d97706",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
