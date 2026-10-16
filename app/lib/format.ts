import type { Invoice } from "../generated/termin";

export function formatCountdown(dueTs: number, now: number): string {
  const diff = dueTs - now;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400);
  const h = Math.floor((abs % 86_400) / 3_600);
  const m = Math.floor((abs % 3_600) / 60);
  const s = abs % 60;
  const parts =
    d > 0
      ? `${d}d ${h}h`
      : h > 0
        ? `${h}h ${m}m`
        : m > 0
          ? `${m}m ${s}s`
          : `${s}s`;
  return diff >= 0 ? `in ${parts}` : `${parts} late`;
}

export function formatHms(totalSeconds: number): string {
  const abs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(abs / 3_600);
  const m = Math.floor((abs % 3_600) / 60);
  const s = abs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDate(ts: number | bigint): string {
  if (ts === 0 || ts === 0n) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(Number(ts) * 1000));
}

export function formatFeePct(bps: number): string {
  return (bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function feeDaysLate(invoice: Invoice, now: number): number {
  const diff = now - Number(invoice.dueTs);
  if (diff <= 0) return 0;
  return Math.floor(diff / 86_400);
}
