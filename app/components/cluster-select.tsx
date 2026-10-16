"use client";

import { useState, useRef, useEffect } from "react";
import { useCluster, CLUSTERS } from "./cluster-context";
import type { ClusterMoniker } from "../lib/solana-client";
import { CheckIcon } from "./ui";

const DOT_CLASS: Record<ClusterMoniker, string> = {
  mainnet: "bg-accent",
  devnet: "bg-info",
  testnet: "bg-warn",
  localnet: "bg-ink-3",
};

function Dot({ cluster }: { cluster: ClusterMoniker }) {
  return (
    <span
      className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[cluster]}`}
      aria-hidden="true"
    />
  );
}

export function ClusterSelect() {
  const { cluster, setCluster } = useCluster();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      >
        <Dot cluster={cluster} />
        {cluster}
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-2 w-44 animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-pop"
        >
          {CLUSTERS.map((c) => (
            <button
              key={c}
              role="option"
              aria-selected={c === cluster}
              onClick={() => {
                setCluster(c);
                setIsOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition hover:bg-surface-2 ${
                c === cluster ? "text-ink" : "text-ink-2"
              }`}
            >
              <span className="flex items-center gap-2">
                <Dot cluster={c} />
                {c}
              </span>
              {c === cluster && <CheckIcon className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
