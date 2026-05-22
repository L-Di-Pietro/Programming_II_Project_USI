/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0d1117",
        surface: "#161b22",
        border: {
          DEFAULT: "#21262d",
          subtle: "#30363d",
        },
        ink: {
          primary: "#e6edf3",
          muted: "#7d8590",
        },
        accent: {
          DEFAULT: "#22d3ee",
          cyan: "#22d3ee",
          green: "#3fb950",
          red: "#f85149",
          amber: "#f0a500",
          // Benchmark series accents — colour-blind-safe and kept distinct
          // from each other, from the cyan strategy line, and from the
          // green/red/amber metric values.
          blue: "#3B82F6", // Buy & Hold
          pink: "#CC79A7", // S&P 500 (reddish-purple)
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
      },
      animation: {
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};
