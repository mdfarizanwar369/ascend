import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        lime: "#35f2d0",
        teal: "#35f2d0",
        violet: "#8b5cf6",
        amber: "#f8b84e",
        calm: "#8b5cf6"
      }
    }
  },
  plugins: []
};

export default config;
