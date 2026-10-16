"use client";

import { useState, type ReactNode } from "react";
import { getBase58Decoder, type Account, type Address } from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { parseTransactionError } from "../lib/errors";
import {
  TERMIN_PROGRAM_ADDRESS,
  ZERO_ADDRESS,
  createAtaIdempotentInstruction,
  feePerSecond,
  findAta,
  formatTokenAmount,
  parseTokenAmount,
  projectedFee,
  secondsToNextFeeIncrement,
} from "../lib/termin";
import {
  feeDaysLate,
  formatCountdown,
  formatDate,
  formatFeePct,
  formatHms,
} from "../lib/format";
import {
  InvoiceStatus,
  getAdvanceInvoiceInstruction,
  getAuthorizeInvoiceInstructionAsync,
  getCancelInvoiceInstruction,
  getCollectInvoiceInstructionAsync,
  getFlagOverdueInstruction,
  getRevokeInvoiceInstruction,
  type Invoice,
} from "../generated/termin";
import { useCluster } from "./cluster-context";
import { displayStatus, StatusChip } from "./status-chip";
import {
  AddressLink,
  AlertIcon,
  BanIcon,
  Button,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  UndoIcon,
  ZapIcon,
} from "./ui";

function YouChip() {
  return (
    <span className="rounded-full bg-accent-soft px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-accent">
      you
    </span>
  );
}

function DetailItem({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="label-xs">{label}</p>
      <div className="mt-1.5 text-[13px] text-ink-2">{children}</div>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn" | "accent" | "muted";
}) {
  const toneClass =
    tone === "warn"
      ? "text-warn"
      : tone === "accent"
        ? "text-accent"
        : tone === "muted"
          ? "text-ink-3"
          : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-[12px] text-ink-2">
        {label}
        {sub && <span className="ml-1.5 text-[11px] text-ink-3">{sub}</span>}
      </span>
      <span className={`num text-[13px] font-medium ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

export function InvoiceRow({
  invoice,
  now,
  expanded,
  onToggle,
  onChanged,
}: {
  invoice: Account<Invoice>;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { wallet, signer } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { getExplorerUrl, cluster } = useCluster();

  const [advanceIn, setAdvanceIn] = useState("");
  const [advancePayout, setAdvancePayout] = useState("");

  const data = invoice.data;
  const myAddress = wallet?.account.address as Address | undefined;
  const isIssuer = myAddress !== undefined && myAddress === data.issuer;
  const isPayer = myAddress !== undefined && myAddress === data.payer;
  const isLp =
    myAddress !== undefined &&
    data.lp !== ZERO_ADDRESS &&
    myAddress === data.lp;

  const due = Number(data.dueTs);
  const isDue = now >= due;
  const hasAdvance = data.advancePayout > 0n;
  const feeNow = projectedFee(data, now);
  const feeMax = (data.amount * BigInt(data.feeCapBps)) / 10_000n;
  const daysLate = feeDaysLate(data, now);
  const isCollected = data.status === InvoiceStatus.Collected;
  const total = isCollected ? data.amount + data.feePaid : data.amount + feeNow;

  const isUnderMandate =
    data.status === InvoiceStatus.Authorized ||
    data.status === InvoiceStatus.Overdue;
  const accruing = isDue && !isCollected && isUnderMandate && feeNow < feeMax;
  const ratePerSec = feePerSecond(data);
  const dayFee = (data.amount * BigInt(data.feeBpsPerDay)) / 10_000n;
  const meterPct = ((now - due) % 86_400) / 864;
  const secsToNextIncrement = secondsToNextFeeIncrement(data, now);

  const status = displayStatus(data, now);

  const canAuthorize =
    isPayer &&
    (data.status === InvoiceStatus.Created ||
      data.status === InvoiceStatus.Revoked);
  const canRevoke =
    isPayer &&
    data.status === InvoiceStatus.Authorized &&
    !isDue &&
    !hasAdvance;
  const canCancel = isIssuer && data.status === InvoiceStatus.Created;
  const canCollect =
    (data.status === InvoiceStatus.Authorized ||
      data.status === InvoiceStatus.Overdue) &&
    isDue;
  const canFlag = data.status === InvoiceStatus.Authorized && isDue;
  const canAdvance =
    (data.status === InvoiceStatus.Authorized ||
      data.status === InvoiceStatus.Overdue) &&
    !hasAdvance;
  const canAct = signer !== undefined && !isSending;
  const hasActions = canAuthorize || canRevoke || canCancel || canCollect;

  const runAction = async (
    label: string,
    buildInstructions: () => Promise<Parameters<typeof send>[0]["instructions"]>
  ) => {
    try {
      const instructions = await buildInstructions();
      const signature = await send({ instructions });
      toast.success(`${label} confirmed`, {
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
      onChanged();
    } catch (err) {
      console.error(`${label} failed:`, err);
      toast.error(parseTransactionError(err));
    }
  };

  const handleAuthorize = () =>
    runAction("Mandate", async () => {
      if (!signer || !myAddress) throw new Error("Wallet not connected");
      const ata = await findAta(myAddress, data.mint);
      return [
        await createAtaIdempotentInstruction(myAddress, myAddress, data.mint),
        await getAuthorizeInvoiceInstructionAsync({
          payer: signer,
          mint: data.mint,
          invoice: invoice.address,
          payerTokenAccount: ata,
        }),
      ];
    });

  const handleRevoke = () =>
    runAction("Revoke", async () => {
      if (!signer) throw new Error("Wallet not connected");
      return [
        getRevokeInvoiceInstruction({
          payer: signer,
          invoice: invoice.address,
          payerTokenAccount: data.payerTokenAccount,
        }),
      ];
    });

  const handleCancel = () =>
    runAction("Cancel", async () => {
      if (!signer) throw new Error("Wallet not connected");
      return [
        getCancelInvoiceInstruction({
          issuer: signer,
          invoice: invoice.address,
        }),
      ];
    });

  const handleCollect = () =>
    runAction("Collection", async () => {
      if (!myAddress) throw new Error("Wallet not connected");
      const issuerAta = await findAta(data.issuer, data.mint);
      const lpAta =
        data.lp !== ZERO_ADDRESS
          ? await findAta(data.lp, data.mint)
          : data.payerTokenAccount;

      return [
        await createAtaIdempotentInstruction(myAddress, data.issuer, data.mint),
        ...(data.lp !== ZERO_ADDRESS
          ? [
              await createAtaIdempotentInstruction(
                myAddress,
                data.lp,
                data.mint
              ),
            ]
          : []),
        await getCollectInvoiceInstructionAsync({
          mint: data.mint,
          invoice: invoice.address,
          payerTokenAccount: data.payerTokenAccount,
          issuerTokenAccount: issuerAta,
          lpTokenAccount: lpAta,
        }),
      ];
    });

  const handleFlagOverdue = () =>
    runAction("Overdue flag", async () => [
      getFlagOverdueInstruction({ invoice: invoice.address }),
    ]);

  const handleAdvance = () =>
    runAction("Advance", async () => {
      if (!signer || !myAddress) throw new Error("Wallet not connected");
      const amountInBase = parseTokenAmount(advanceIn);
      const payoutBase = parseTokenAmount(advancePayout);
      if (amountInBase <= 0n || payoutBase <= 0n) {
        throw new Error("Enter both advance amounts.");
      }
      const myAta = await findAta(myAddress, data.mint);
      const issuerAta = await findAta(data.issuer, data.mint);
      return [
        await createAtaIdempotentInstruction(myAddress, myAddress, data.mint),
        await createAtaIdempotentInstruction(myAddress, data.issuer, data.mint),
        getAdvanceInvoiceInstruction({
          lp: signer,
          mint: data.mint,
          invoice: invoice.address,
          lpTokenAccount: myAta,
          issuerTokenAccount: issuerAta,
          amountIn: amountInBase,
          payout: payoutBase,
        }),
      ];
    });

  const defaultAdvancePayout = formatTokenAmount(data.amount);
  const defaultAdvanceIn = formatTokenAmount((data.amount * 97n) / 100n);
  const effectiveAdvanceIn = parseTokenAmount(advanceIn || defaultAdvanceIn);

  const feeCollapsed = isCollected
    ? `+${formatTokenAmount(data.feePaid)}`
    : canCollect || (isDue && data.status === InvoiceStatus.Overdue)
      ? `+${formatTokenAmount(feeNow)}`
      : "—";
  const feeTone = isCollected
    ? "text-accent"
    : feeCollapsed === "—"
      ? "text-ink-3"
      : "text-warn";

  const reference = getBase58Decoder().decode(data.reference);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`grid w-full cursor-pointer grid-cols-2 items-center gap-x-4 gap-y-3 px-5 py-4 text-left transition hover:bg-surface-2/60 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,0.7fr)_28px] lg:gap-y-0 ${
          expanded ? "bg-surface-2/40" : ""
        }`}
      >
        <div className="col-span-2 lg:col-span-1">
          <p className="text-[13px] font-semibold">
            Invoice Nº {data.invoiceId.toString()}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">
            {invoice.address.slice(0, 6)}…{invoice.address.slice(-6)}
          </p>
        </div>

        <div className="col-span-2 flex flex-col gap-1 lg:col-span-1">
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="inline-block w-10 shrink-0 text-[10px] uppercase tracking-wide text-ink-3">
              Buyer
            </span>
            <span className="font-mono">
              {data.payer.slice(0, 5)}…{data.payer.slice(-5)}
            </span>
            {isPayer && <YouChip />}
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="inline-block w-10 shrink-0 text-[10px] uppercase tracking-wide text-ink-3">
              Seller
            </span>
            <span className="font-mono">
              {data.issuer.slice(0, 5)}…{data.issuer.slice(-5)}
            </span>
            {isIssuer && <YouChip />}
          </span>
        </div>

        <div className="lg:text-right">
          <p className="num text-[15px] font-semibold">
            {formatTokenAmount(data.amount)}
            <span className="ml-1 text-[11px] font-normal text-ink-3">
              tUSD
            </span>
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3 lg:hidden">
            Amount
          </p>
        </div>

        <div className="lg:text-right">
          <p
            className={`text-[13px] font-medium ${
              (status === "active" || status === "overdue") && isDue
                ? "text-warn"
                : "text-ink-2"
            }`}
          >
            {status === "awaiting" ||
            status === "active" ||
            status === "overdue"
              ? formatCountdown(due, now)
              : formatDate(data.dueTs)}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3">
            Due {formatDate(data.dueTs).split(",")[0]}
          </p>
        </div>

        <div className="lg:text-right">
          <StatusChip status={status} />
        </div>

        <div className="lg:text-right">
          <p className={`num text-[13px] font-medium ${feeTone}`}>
            {accruing && (
              <span className="mr-1.5 inline-block size-1 animate-pulse-dot rounded-full bg-warn align-middle" />
            )}
            {feeCollapsed}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3">
            Late fee
          </p>
        </div>

        <div className="hidden justify-end lg:flex">
          <ChevronDownIcon
            className={`text-ink-3 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="animate-fade-up border-t border-line bg-surface-2/50 px-5 py-5">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
            <div className="grid content-start gap-x-8 gap-y-5 sm:grid-cols-2">
              <DetailItem label="Seller">
                <span className="inline-flex items-center gap-2">
                  <AddressLink
                    address={data.issuer}
                    href={getExplorerUrl(`/address/${data.issuer}`)}
                  />
                  {isIssuer && <YouChip />}
                </span>
              </DetailItem>
              <DetailItem label="Buyer">
                <span className="inline-flex items-center gap-2">
                  <AddressLink
                    address={data.payer}
                    href={getExplorerUrl(`/address/${data.payer}`)}
                  />
                  {isPayer && <YouChip />}
                </span>
              </DetailItem>

              {data.lp !== ZERO_ADDRESS && (
                <DetailItem label="Investor (LP)">
                  <span className="inline-flex items-center gap-2">
                    <AddressLink
                      address={data.lp}
                      href={getExplorerUrl(`/address/${data.lp}`)}
                    />
                    {isLp && <YouChip />}
                  </span>
                </DetailItem>
              )}

              <DetailItem label="Fee terms">
                {formatFeePct(data.feeBpsPerDay)}%/day, cap{" "}
                {formatFeePct(data.feeCapBps)}%
                <p className="mt-0.5 text-[11px] text-ink-3">
                  max {formatTokenAmount(feeMax)} tUSD
                </p>
              </DetailItem>

              <DetailItem label="Issued">
                {formatDate(data.createdTs)}
              </DetailItem>
              <DetailItem label="Mandate signed">
                {formatDate(data.authorizedTs)}
              </DetailItem>
              {data.overdueTs > 0n && (
                <DetailItem label="Flagged overdue">
                  {formatDate(data.overdueTs)}
                </DetailItem>
              )}
              {isCollected && (
                <DetailItem label="Collected">
                  {formatDate(data.collectedTs)}
                </DetailItem>
              )}

              <DetailItem label="Reference" wide>
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-2">
                    {reference.slice(0, 10)}…{reference.slice(-10)}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    unique invoice fingerprint, stored on-chain
                  </span>
                </span>
              </DetailItem>
            </div>

            <div>
              <div className="h-fit rounded-xl border border-line bg-surface p-4">
                <p className="label-xs">
                  {isCollected ? "Settlement" : "Settlement preview"}
                </p>
                <div className="mt-2">
                  <MoneyRow
                    label="Face value"
                    value={`${formatTokenAmount(data.amount)} tUSD`}
                  />
                  {(feeNow > 0n || isCollected) && (
                    <MoneyRow
                      label={isCollected ? "Late fee paid" : "Late fee"}
                      sub={
                        isCollected
                          ? undefined
                          : daysLate > 0
                            ? `${daysLate}d × ${formatFeePct(data.feeBpsPerDay)}%/day`
                            : undefined
                      }
                      value={`+${formatTokenAmount(isCollected ? data.feePaid : feeNow)} tUSD`}
                      tone={isCollected ? "accent" : "warn"}
                    />
                  )}
                  {accruing && (
                    <div className="mt-2.5 rounded-lg border border-warn-soft bg-warn-soft/50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warn">
                          <span className="size-1.5 animate-pulse-dot rounded-full bg-warn" />
                          Fee meter
                        </span>
                        <span className="num text-[11px] font-medium text-warn">
                          +
                          {ratePerSec.toLocaleString("en-US", {
                            maximumFractionDigits: 6,
                          })}
                          /s
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-warn-soft">
                        <div
                          className="h-full rounded-full bg-warn transition-[width] duration-1000 ease-linear"
                          style={{ width: `${meterPct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-3">
                        next +{formatTokenAmount(dayFee)} tUSD in{" "}
                        <span className="num">
                          {formatHms(secsToNextIncrement)}
                        </span>{" "}
                        · fees settle in whole days
                      </p>
                    </div>
                  )}
                  {hasAdvance && (
                    <MoneyRow
                      label="LP advance payout"
                      sub="repaid first"
                      value={`${formatTokenAmount(data.advancePayout)} tUSD`}
                      tone="muted"
                    />
                  )}
                  <div className="my-1.5 border-t border-dashed border-line-strong" />
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[12px] font-medium text-ink-2">
                      {isCollected ? "Paid at collection" : "Total to collect"}
                    </span>
                    <span className="num text-[15px] font-semibold">
                      {formatTokenAmount(total)} tUSD
                    </span>
                  </div>
                  {hasAdvance && !isCollected && (
                    <p className="mt-2 text-[11px] leading-snug text-ink-3">
                      {formatTokenAmount(data.advancePayout)} goes to the
                      investor first; the seller receives the remainder
                      {total > data.advancePayout
                        ? ` (${formatTokenAmount(total - data.advancePayout)} tUSD)`
                        : ""}
                      .
                    </p>
                  )}
                  {status === "awaiting" && (
                    <p className="mt-2 text-[11px] leading-snug text-ink-3">
                      The buyer must sign the payment mandate before this
                      invoice can be collected.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {canAuthorize && (
                  <Button
                    variant="primary"
                    onClick={handleAuthorize}
                    disabled={!canAct}
                  >
                    <PlusIcon /> Sign payment mandate
                  </Button>
                )}
                {canCollect && (
                  <Button
                    variant="primary"
                    onClick={handleCollect}
                    disabled={!canAct}
                  >
                    <ZapIcon /> Collect {formatTokenAmount(total)} tUSD
                  </Button>
                )}
                {canRevoke && (
                  <Button onClick={handleRevoke} disabled={!canAct}>
                    <UndoIcon /> Revoke mandate
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="danger"
                    onClick={handleCancel}
                    disabled={!canAct}
                  >
                    <BanIcon /> Cancel invoice
                  </Button>
                )}
                {canFlag && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleFlagOverdue}
                    disabled={!canAct}
                  >
                    <AlertIcon /> Flag overdue on-chain
                  </Button>
                )}
                {!hasActions && canFlag === false && (
                  <p className="text-[12px] text-ink-3">
                    {status === "collected"
                      ? "Settled on-chain — nothing left to do."
                      : status === "awaiting"
                        ? "Waiting for the buyer to sign the payment mandate."
                        : status === "active"
                          ? "Collection opens automatically on the due date."
                          : "No actions available for your wallet on this invoice."}
                  </p>
                )}
              </div>

              <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                <CheckIcon className="text-accent" />
                Enforced on-chain by program
                <a
                  href={getExplorerUrl(`/address/${TERMIN_PROGRAM_ADDRESS}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline decoration-dotted underline-offset-2 transition hover:text-ink"
                >
                  {TERMIN_PROGRAM_ADDRESS.slice(0, 4)}…
                  {TERMIN_PROGRAM_ADDRESS.slice(-4)}
                </a>
                on {cluster}
              </p>

              {!signer && hasActions && (
                <p className="mt-2 text-[11px] text-ink-3">
                  Connect a wallet to act on this invoice.
                </p>
              )}

              {canAdvance && (
                <div className="mt-4 rounded-xl border border-dashed border-line-strong p-4">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
                    <ZapIcon className="text-accent" /> Advance as investor (LP)
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-ink-3">
                    Pay the seller early — you are repaid first, with the late
                    fee, when the invoice is collected.
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-ink-3">
                        Pay now
                      </span>
                      <input
                        value={advanceIn || defaultAdvanceIn}
                        onChange={(e) => setAdvanceIn(e.target.value)}
                        disabled={!canAct}
                        className="num w-28 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] transition focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-45"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-ink-3">
                        Collect later
                      </span>
                      <input
                        value={advancePayout || defaultAdvancePayout}
                        onChange={(e) => setAdvancePayout(e.target.value)}
                        disabled={!canAct}
                        className="num w-28 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] transition focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-45"
                      />
                    </label>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAdvance}
                      disabled={!canAct || effectiveAdvanceIn <= 0n}
                    >
                      Advance{" "}
                      {effectiveAdvanceIn > 0n
                        ? formatTokenAmount(effectiveAdvanceIn)
                        : ""}{" "}
                      tUSD
                    </Button>
                    <span className="text-[11px] text-ink-3">
                      discount{" "}
                      {formatTokenAmount(
                        data.amount - effectiveAdvanceIn > 0n
                          ? data.amount - effectiveAdvanceIn
                          : 0n
                      )}{" "}
                      tUSD
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
