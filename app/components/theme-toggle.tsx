"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "./ui";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-surface text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      aria-label="Toggle theme"
    >
      {mounted ? (
        isDark ? (
          <SunIcon className="text-[15px]" />
        ) : (
          <MoonIcon className="text-[15px]" />
        )
      ) : (
        <span className="size-4" />
      )}
    </button>
  );
}
