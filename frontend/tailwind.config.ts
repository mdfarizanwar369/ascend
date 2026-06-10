import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#121417",
        surface: "#191d22",
        line: "#2b3138",
        lime: "#a7f04f",
        amber: "#f8b84e",
        calm: "#77a8ff"
      }
    }
  },
  plugins: []
};

export default config;

