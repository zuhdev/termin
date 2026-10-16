"use client";

import { useEffect, useRef, useState } from "react";
import { address, type Address } from "@solana/kit";
import { toast } from "sonner";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { parseTransactionError } from "../lib/errors";
import { DEMO_MINT, parseTokenAmount } from "../lib/termin";
import { getCreateInvoiceInstructionAsync } from "../generated/termin";
import { useCluster } from "./cluster-context";
import { Button, Field, Input, XIcon } from "./ui";

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const PRESETS: { label: string; seconds: number }[] = [
  { label: "+60s", seconds: 60 },
  { label: "+1h", seconds: 3_600 },
  { label: "+1 day", seconds: 86_400 },
  { label: "2 days overdue", seconds: -2 * 86_400 - 300 },
];

export function CreateInvoiceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { signer, send, isSending } = useSendTransaction();
  const { getExplorerUrl } = useCluster();
  const payerRef = useRef<HTMLInputElement>(null);

  const [payerAddress, setPayerAddress] = useState("");
  const [amount, setAmount] = useState("5000");
  const [dueLocal, setDueLocal] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 60_000))
  );
  const [feePerDayPct, setFeePerDayPct] = useState("0.5");
  const [feeCapPct, setFeeCapPct] = useState("5");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => payerRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!signer) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!DEMO_MINT) {
      toast.error("Demo token mint is not configured.", {
        description: "Set NEXT_PUBLIC_DEMO_MINT in .env.local.",
      });
      return;
    }

    let payer: Address;
    try {
      payer = address(payerAddress.trim());
    } catch {
      toast.error("Buyer address is not a valid Solana address.");
      return;
    }

    const amountBase = parseTokenAmount(amount);
    if (amountBase <= 0n) {
      toast.error("Enter an amount greater than zero.");
      return;
    }

    const dueMs = new Date(dueLocal).getTime();
    if (!Number.isFinite(dueMs)) {
      toast.error("Pick a valid due date.");
      return;
    }
    const dueTs = BigInt(Math.floor(dueMs / 1000));

    const feeBpsPerDay = Math.round(Number.parseFloat(feePerDayPct) * 100);
    const feeCapBps = Math.round(Number.parseFloat(feeCapPct) * 100);
    if (
      !Number.isFinite(feeBpsPerDay) ||
      !Number.isFinite(feeCapBps) ||
      feeBpsPerDay < 0 ||
      feeCapBps < 0
    ) {
      toast.error("Invalid late-fee configuration.");
      return;
    }

    const reference = crypto.getRandomValues(new Uint8Array(32));

    try {
      const instruction = await getCreateInvoiceInstructionAsync({
        issuer: signer,
        payer,
        mint: DEMO_MINT,
        invoiceId: BigInt(Date.now()),
        amount: amountBase,
        dueTs,
        feeBpsPerDay,
        feeCapBps,
        reference,
      });

      const signature = await send({ instructions: [instruction] });

      toast.success("Invoice created on-chain", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Create invoice failed:", err);
      toast.error(parseTransactionError(err));
    }
  };

  const disabled = isSending || !payerAddress || !amount || !DEMO_MINT;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-invoice-title"
        className="w-full max-w-lg animate-pop rounded-2xl border border-line bg-surface shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2
              id="create-invoice-title"
              className="font-display text-[17px] font-semibold tracking-tight"
            >
              Issue an invoice
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Only you sign here — the buyer authorizes a mandate later.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink"
          >
            <XIcon className="text-sm" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field
            label="Buyer wallet address"
            className="sm:col-span-2"
            hint="The buyer stays a plain address until they sign the mandate."
          >
            <Input
              ref={payerRef}
              value={payerAddress}
              onChange={(e) => setPayerAddress(e.target.value)}
              placeholder="e.g. 2KzsFupwWT3KYXcnVkZigq6BcLQ3qGMJi9cSxZA5Dnwq"
              disabled={isSending}
              className="font-mono text-xs"
            />
          </Field>

          <Field label="Amount">
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSending}
                className="num pr-12"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-ink-3">
                tUSD
              </span>
            </div>
          </Field>

          <Field label="Due date">
            <Input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
              disabled={isSending}
            />
          </Field>

          <div className="flex flex-wrap gap-1.5 sm:col-span-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  setDueLocal(
                    toLocalInputValue(new Date(Date.now() + p.seconds * 1000))
                  )
                }
                disabled={isSending}
                className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-45"
              >
                {p.label}
              </button>
            ))}
          </div>

          <Field label="Late fee, % per day">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={feePerDayPct}
              onChange={(e) => setFeePerDayPct(e.target.value)}
              disabled={isSending}
              className="num"
            />
          </Field>

          <Field label="Late fee cap, % of value">
            <Input
              type="number"
              min="0"
              step="0.5"
              value={feeCapPct}
              onChange={(e) => setFeeCapPct(e.target.value)}
              disabled={isSending}
              className="num"
            />
          </Field>

          {!DEMO_MINT && (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-[11px] text-warn sm:col-span-2">
              Demo token not configured — set NEXT_PUBLIC_DEMO_MINT in
              .env.local after running the seed script.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-[11px] text-ink-3">
            Fee accrues only after the due date.
          </p>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={isSending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={disabled}
            >
              Issue invoice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
