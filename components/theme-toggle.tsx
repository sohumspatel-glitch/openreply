"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "openreply-theme";

/**
 * The script that runs before paint.
 *
 * Reading localStorage in an effect is too late: the browser has already
 * painted the light palette, so a dark-mode operator gets a white flash on
 * every navigation. This runs synchronously in <head>, before the first paint,
 * which is the only way to avoid it. It is small on purpose — anything that
 * throws here blocks rendering, so it is wrapped and fails back to light.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var dark = stored === "dark" ||
      ((!stored || stored === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
`;

function apply(theme: Theme) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  // Rendered on the server as light; the pre-paint script may already have set
  // dark. Until this mounts we cannot know which, so the control renders in a
  // neutral state rather than asserting the wrong one for a frame.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setTheme(stored);
    setMounted(true);

    // Following the OS while set to "system" means a machine that flips at
    // sunset flips the dashboard with it, without a reload.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as Theme | null) !== "light" &&
          (localStorage.getItem(STORAGE_KEY) as Theme | null) !== "dark") {
        apply("system");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private windows and blocked site data both throw here. The theme still
      // applies for this session; it just will not be remembered.
    }
    apply(next);
  }

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: "light",
      label: "Light",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      value: "system",
      label: "System",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="2.5" y="4" width="19" height="13" rx="2" />
          <path d="M8.5 20.5h7" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Dark",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-pill border border-border bg-surface-field p-0.5"
    >
      {options.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => choose(o.value)}
            className={
              "inline-flex h-7 w-7 items-center justify-center rounded-pill motion-safe:transition-colors " +
              (active
                ? "bg-surface text-foreground shadow-hair"
                : "text-faint hover:text-foreground-soft")
            }
          >
            <span className="h-3.5 w-3.5">{o.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
