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
        lime: "rgb(var(--ascend-accent-primary) / <alpha-value>)",
        teal: "rgb(var(--ascend-accent-primary) / <alpha-value>)",
        violet: "rgb(var(--ascend-accent-violet) / <alpha-value>)",
        amber: "rgb(var(--ascend-accent-amber) / <alpha-value>)",
        calm: "rgb(var(--ascend-accent-violet) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(0, 0, 0, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
