"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const storageKey = "ascend-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(storageKey, theme);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  const label = nextTheme === "light" ? "Switch to light mode" : "Switch to dark mode";
  const Icon = nextTheme === "light" ? Sun : Moon;

  return (
    <button
      type="button"
      className={`ascend-pressable grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-zinc-100 hover:border-calm/50 ${className}`}
      aria-label={label}
      title={label}
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
    >
      <Icon size={19} aria-hidden="true" />
    </button>
  );
}
