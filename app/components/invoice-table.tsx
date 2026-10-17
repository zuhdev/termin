"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Account } from "@solana/kit";
import type { Invoice } from "../generated/termin";
import type { InvoiceMandate } from "../lib/mandates";
import { InvoiceRow } from "./invoice-row";
import { displayStatus, type DisplayStatus } from "./status-chip";
import { useNow } from "../lib/hooks/use-now";
import { Button, PlusIcon, RefreshIcon, SearchIcon } from "./ui";

type FilterKey = "all" | "outstanding" | "overdue" | "collected";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "collected", label: "Collected" },
];

function matchesFilter(status: DisplayStatus, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "outstanding":
      return (
        status === "awaiting" || status === "active" || status === "overdue"
      );
    case "overdue":
      return status === "overdue";
    case "collected":
      return status === "collected";
  }
}

function matchesQuery(invoice: Account<Invoice>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const d = invoice.data;
  return [
    d.invoiceId.toString(),
    invoice.address,
    d.issuer,
    d.payer,
    d.lp,
  ].some((v) => v.toLowerCase().includes(q));
}

function StepCard({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-left">
      <span className="inline-flex size-6 items-center justify-center rounded-full border border-accent/40 text-[11px] font-bold text-accent">
        {step}
      </span>
      <p className="font-display mt-2.5 text-[13px] font-semibold tracking-tight">
        {title}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-ink-3">{children}</p>
    </div>
  );
}

function EmptyState({
  canIssue,
  onNewInvoice,
}: {
  canIssue: boolean;
  onNewInvoice: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-12 text-center">
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        <StepCard step="1" title="Issue">
          The seller creates the invoice on-chain: face value, due date, and the
          late-fee schedule.
        </StepCard>
        <StepCard step="2" title="Authorize">
          The buyer signs a one-time payment mandate. It can be revoked before
          the due date, not after.
        </StepCard>
        <StepCard step="3" title="Collect">
          When the due date passes, anyone can trigger collection. Funds move
          from buyer to seller, and the late fee enforces itself.
        </StepCard>
      </div>
      <div className="max-w-md">
        <h3 className="font-display text-[16px] font-semibold tracking-tight">
          No invoices on-chain yet
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          <em>Terminy pilnują się same</em>: deadlines that enforce themselves.
          Issue the first invoice to see it live.
        </p>
      </div>
      <Button variant="primary" onClick={onNewInvoice} disabled={!canIssue}>
        <PlusIcon /> Issue the first invoice
      </Button>
      {!canIssue && (
        <p className="-mt-3 text-[11px] text-ink-3">
          Connect a wallet to start.
        </p>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`flex items-center justify-between gap-6 px-5 py-5 ${
            i > 0 ? "border-t border-line" : ""
          }`}
        >
          <div className="space-y-2">
            <div className="skeleton h-3.5 w-28 rounded" />
            <div className="skeleton h-3 w-20 rounded" />
          </div>
          <div className="skeleton hidden h-3.5 w-44 rounded sm:block" />
          <div className="skeleton h-3.5 w-24 rounded" />
          <div className="skeleton hidden h-6 w-28 rounded-full md:block" />
        </div>
      ))}
    </div>
  );
}

export function InvoiceTable({
  invoices,
  mandates,
  isLoading,
  onChanged,
  onNewInvoice,
  canIssue,
}: {
  invoices: Account<Invoice>[];
  mandates: Map<string, InvoiceMandate>;
  isLoading: boolean;
  onChanged: () => void;
  onNewInvoice: () => void;
  canIssue: boolean;
}) {
  const now = useNow();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return invoices
      .filter(
        (inv) =>
          matchesFilter(displayStatus(inv.data, now), filter) &&
          matchesQuery(inv, query)
      )
      .sort((a, b) => Number(b.data.createdTs - a.data.createdTs));
  }, [invoices, filter, query, now]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: invoices.length,
      outstanding: 0,
      overdue: 0,
      collected: 0,
    };
    for (const inv of invoices) {
      const s = displayStatus(inv.data, now);
      if (matchesFilter(s, "outstanding")) c.outstanding += 1;
      if (s === "overdue") c.overdue += 1;
      if (s === "collected") c.collected += 1;
    }
    return c;
  }, [invoices, now]);

  const showEmpty = !isLoading && invoices.length === 0;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-[10px] border border-line bg-surface p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                filter === f.key
                  ? "bg-surface-3 text-ink"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {f.label}
              <span
                className={`num ml-1.5 text-[10px] ${
                  filter === f.key ? "text-ink-2" : "text-ink-3/70"
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-1 hidden items-center gap-1.5 text-[11px] text-ink-3 md:inline-flex">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
            live · refreshes every 15s
          </span>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search invoice, address…"
              className="w-48 rounded-[10px] border border-line bg-surface py-2 pl-8 pr-3 text-xs transition placeholder:text-ink-3 focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:w-60"
            />
          </div>
          <button
            onClick={onChanged}
            aria-label="Refresh invoices"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-surface text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <RefreshIcon className="text-[13px]" />
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        {isLoading && invoices.length === 0 ? (
          <SkeletonRows />
        ) : showEmpty ? (
          <EmptyState canIssue={canIssue} onNewInvoice={onNewInvoice} />
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-3">
            No invoices match this view.
          </p>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,0.7fr)_28px] items-center gap-4 border-b border-line bg-surface-2/40 px-5 py-2.5 lg:grid">
              <span className="label-xs">Invoice</span>
              <span className="label-xs">Counterparty</span>
              <span className="label-xs lg:text-right">Amount</span>
              <span className="label-xs lg:text-right">Due</span>
              <span className="label-xs lg:text-right">Status</span>
              <span className="label-xs lg:text-right">Late fee</span>
              <span />
            </div>
            <div className="[&>*+*]:border-t [&>*+*]:border-line">
              {filtered.map((invoice) => (
                <InvoiceRow
                  key={invoice.address}
                  invoice={invoice}
                  mandates={mandates}
                  now={now}
                  expanded={expandedId === invoice.address}
                  onToggle={() =>
                    setExpandedId(
                      expandedId === invoice.address ? null : invoice.address
                    )
                  }
                  onChanged={onChanged}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
