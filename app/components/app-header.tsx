"use client";

import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { ClusterSelect } from "./cluster-select";
import { WalletButton } from "./wallet-button";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to the landing page"
            className="transition hover:opacity-80"
          >
            <Logo />
          </Link>
          <span className="hidden rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3 sm:inline">
            HackYeah 2026
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ClusterSelect />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
