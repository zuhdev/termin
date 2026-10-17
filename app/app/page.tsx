"use client";

import { useState } from "react";
import { useWallet } from "../lib/wallet/context";
import { useInvoices } from "../lib/hooks/use-invoices";
import { useSlot } from "../lib/hooks/use-slot";
import { TERMIN_PROGRAM_ADDRESS } from "../lib/termin";
import { AppHeader } from "../components/app-header";
import { StatsStrip } from "../components/stats-strip";
import { InvoiceTable } from "../components/invoice-table";
import { CreateInvoiceDialog } from "../components/create-invoice-dialog";
import { FaucetButton } from "../components/faucet-button";
import { Button, PlusIcon } from "../components/ui";
import { useCluster } from "../components/cluster-context";
import { AddressLink } from "../components/ui";

export default function App() {
  const { status } = useWallet();
  const { invoices, mandates, isLoading, mutate } = useInvoices();
  const { getExplorerUrl, cluster } = useCluster();
  const slot = useSlot();
  const [dialogOpen, setDialogOpen] = useState(false);

  const connected = status === "connected";

  return (
    <div className="relative min-h-screen">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-texture"
        aria-hidden="true"
      />

      <AppHeader />

      <main className="relative mx-auto max-w-6xl px-6 pb-20">
        <section className="flex flex-wrap items-end justify-between gap-4 pt-10 pb-2">
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">
              Receivables
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              Self-collecting B2B invoices on Solana.{" "}
              {connected
                ? "You are connected. Issue, authorize, or collect below. Acting as a buyer or lender? Grab test tUSD from the faucet."
                : "Connect a wallet to issue, sign, or collect."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FaucetButton />
            <Button
              variant="primary"
              onClick={() => setDialogOpen(true)}
              disabled={!connected}
            >
              <PlusIcon /> New invoice
            </Button>
          </div>
        </section>

        <StatsStrip invoices={invoices} isLoading={isLoading} />

        <InvoiceTable
          invoices={invoices}
          mandates={mandates}
          isLoading={isLoading}
          onChanged={() => void mutate()}
          onNewInvoice={() => setDialogOpen(true)}
          canIssue={connected}
        />

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[11px] text-ink-3">
          <p>
            Built for HackYeah 2026 · Superteam Poland track · all logic
            on-chain, no backend
          </p>
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
              {cluster} ·{" "}
              <span className="num">
                {slot !== undefined
                  ? `slot ${slot.toLocaleString("en-US")}`
                  : "syncing…"}
              </span>
            </span>
            <span className="inline-flex items-center gap-2">
              Program
              <AddressLink
                address={TERMIN_PROGRAM_ADDRESS}
                href={getExplorerUrl(`/address/${TERMIN_PROGRAM_ADDRESS}`)}
                chars={6}
              />
            </span>
          </span>
        </footer>
      </main>

      <CreateInvoiceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => void mutate()}
      />
    </div>
  );
}
