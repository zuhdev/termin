"use client";

import { InvoiceStatus, type Invoice } from "../generated/termin";

export type DisplayStatus =
  "awaiting" | "active" | "overdue" | "collected" | "revoked" | "cancelled";

export function displayStatus(invoice: Invoice, now: number): DisplayStatus {
  switch (invoice.status) {
    case InvoiceStatus.Created:
      return "awaiting";
    case InvoiceStatus.Authorized:
      return now >= Number(invoice.dueTs) ? "overdue" : "active";
    case InvoiceStatus.Overdue:
      return "overdue";
    case InvoiceStatus.Collected:
      return "collected";
    case InvoiceStatus.Revoked:
      return "revoked";
    default:
      return "cancelled";
  }
}

const STATUS_META: Record<DisplayStatus, { label: string; className: string }> =
  {
    awaiting: {
      label: "Awaiting mandate",
      className: "bg-surface-2 text-ink-2",
    },
    active: {
      label: "Mandate active",
      className: "bg-info-soft text-info",
    },
    overdue: {
      label: "Overdue",
      className: "bg-warn-soft text-warn",
    },
    collected: {
      label: "Collected",
      className: "bg-accent-soft text-accent",
    },
    revoked: {
      label: "Revoked",
      className: "bg-danger-soft text-danger",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-surface-2 text-ink-3",
    },
  };

export function StatusChip({ status }: { status: DisplayStatus }) {
  const meta = STATUS_META[status];
  const pulsing = status === "overdue";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}
    >
      <span
        className={`size-1.5 rounded-full bg-current ${pulsing ? "animate-pulse-dot" : ""}`}
      />
      {meta.label}
    </span>
  );
}
