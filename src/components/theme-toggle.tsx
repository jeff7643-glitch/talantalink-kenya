"use client";

import { useState } from "react";

export default function ThemeToggle() {
  const [persistenceError, setPersistenceError] = useState(false);

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;

    try {
      window.localStorage.setItem("talantalink-theme", nextTheme);
      setPersistenceError(false);
    } catch {
      setPersistenceError(true);
    }
  }

  return (
    <div className="theme-control">
      {persistenceError && (
        <span className="theme-status" role="status">
          Theme changed, but your preference could not be saved.
        </span>
      )}
      <button
        className="theme-toggle"
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle color theme"
        title="Toggle color theme"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
        </svg>
        <span>Dark / light</span>
      </button>
    </div>
  );
}
