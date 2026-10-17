"use client";

import type { Account } from "@solana/kit";
import { InvoiceStatus, type Invoice } from "../generated/termin";
import { formatTokenAmount, projectedFee } from "../lib/termin";
import { useNow } from "../lib/hooks/use-now";

type Stats = {
  outstanding: bigint;
  overdue: bigint;
  overdueCount: number;
  collected: bigint;
  collectedCount: number;
  mandates: number;
};

function computeStats(invoices: Account<Invoice>[], now: number): Stats {
  let outstanding = 0n;
  let overdue = 0n;
  let overdueCount = 0;
  let collected = 0n;
  let collectedCount = 0;
  let mandates = 0;

  for (const { data } of invoices) {
    if (
      data.status === InvoiceStatus.Authorized ||
      data.status === InvoiceStatus.Overdue
    ) {
      const fee = projectedFee(data, now);
      outstanding += data.amount + fee;
      mandates += 1;
      if (now >= Number(data.dueTs)) {
        overdue += data.amount + fee;
        overdueCount += 1;
      }
    } else if (data.status === InvoiceStatus.Collected) {
      collected += data.amount + data.feePaid;
      collectedCount += 1;
    }
  }

  return {
    outstanding,
    overdue,
    overdueCount,
    collected,
    collectedCount,
    mandates,
  };
}

function StatCell({
  label,
  value,
  suffix = "tUSD",
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  suffix?: string;
  note: string;
  tone?: "default" | "warn" | "accent";
}) {
  const toneClass =
    tone === "warn"
      ? "text-warn"
      : tone === "accent"
        ? "text-accent"
        : "text-ink";
  return (
    <div className="bg-surface p-5">
      <p className="label-xs">{label}</p>
      <p
        className={`font-display num mt-2 text-[22px] font-semibold leading-none tracking-tight lg:text-2xl ${toneClass}`}
      >
        {value}
        <span className="ml-1.5 text-xs font-normal text-ink-3">{suffix}</span>
      </p>
      <p className="mt-2 text-xs text-ink-3">{note}</p>
    </div>
  );
}

export function StatsStrip({
  invoices,
  isLoading,
}: {
  invoices: Account<Invoice>[];
  isLoading: boolean;
}) {
  const now = useNow();

  if (isLoading && invoices.length === 0) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface p-5">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton mt-3 h-6 w-28 rounded" />
            <div className="skeleton mt-3 h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const stats = computeStats(invoices, now);

  return (
    <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
      <StatCell
        label="Receivable"
        value={formatTokenAmount(stats.outstanding)}
        note={`${stats.mandates}${stats.mandates === 1 ? " mandate" : " mandates"} · incl. accrued fees`}
      />
      <StatCell
        label="Overdue"
        value={formatTokenAmount(stats.overdue)}
        note={
          stats.overdueCount === 0
            ? "nothing late · dobrze"
            : `${stats.overdueCount}${stats.overdueCount === 1 ? " invoice" : " invoices"} late`
        }
        tone={stats.overdueCount > 0 ? "warn" : "default"}
      />
      <StatCell
        label="Collected"
        value={formatTokenAmount(stats.collected)}
        note={`${stats.collectedCount}${stats.collectedCount === 1 ? " invoice" : " invoices"} settled`}
        tone={stats.collectedCount > 0 ? "accent" : "default"}
      />
      <StatCell
        label="Open mandates"
        value={String(stats.mandates)}
        suffix={stats.mandates === 1 ? "invoice" : "invoices"}
        note="authorized, ready to collect"
      />
    </div>
  );
}
