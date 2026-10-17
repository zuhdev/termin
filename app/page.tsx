import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "./components/logo";
import { TERMIN_PROGRAM_ADDRESS } from "./lib/termin";
import { getExplorerUrl } from "./lib/explorer";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CoinsIcon,
  ExternalLinkIcon,
  ZapIcon,
} from "./components/ui";

export const metadata: Metadata = {
  title: "termin: invoices that pay themselves",
  description:
    "Self-collecting B2B invoices on Solana: a signed payment mandate, automatic collection on the due date, on-chain late fees, and optional investor advances. Live on devnet.",
};

const SERIF_ACCENT = "font-serif italic font-normal";

const PILL_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_28px_-8px_var(--ring)] transition hover:opacity-90 active:scale-[0.98]";
const PILL_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-5 py-2.5 text-[13px] font-medium text-ink transition hover:bg-surface-2 active:scale-[0.98]";
const HERO_PILL_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-[#0A3D28] shadow-[0_2px_14px_rgba(0,0,0,0.28)] transition hover:bg-white/90 active:scale-[0.98]";
const HERO_PILL_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-white/35 px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-white/10 active:scale-[0.98]";

const HERO_BG =
  "radial-gradient(120% 90% at 88% -10%, rgba(255,255,255,0.16) 0%, transparent 55%), radial-gradient(90% 70% at 6% 112%, rgba(0,0,0,0.26) 0%, transparent 60%), linear-gradient(160deg, #0D7A4B 0%, #085C39 100%)";

const CHIPS = [
  { label: "Live on devnet", dot: true },
  { label: "payer-signed mandate", dot: false },
  { label: "enforced on-chain", dot: false },
  { label: "no backend", dot: false },
];

function ProblemStat({
  value,
  note,
  tone,
}: {
  value: string;
  note: string;
  tone: "warn" | "neutral" | "accent";
}) {
  const valueClass =
    tone === "warn"
      ? "text-warn"
      : tone === "accent"
        ? "text-accent"
        : "text-ink";
  const tileClass =
    tone === "warn"
      ? "border-warn/25 bg-warn-soft"
      : tone === "accent"
        ? "border-accent/25 bg-accent-soft"
        : "border-line bg-surface shadow-card";
  return (
    <div className={`rounded-[20px] border p-6 ${tileClass}`}>
      <p
        className={`num font-display text-[30px] font-semibold leading-none tracking-tight ${valueClass}`}
      >
        {value}
      </p>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-2">{note}</p>
    </div>
  );
}

function StepItem({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">
        {step}
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold tracking-tight">
          {title}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          {children}
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-line bg-surface p-5 shadow-card">
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent-soft text-[15px] text-accent">
        {icon}
      </span>
      <p className="font-display mt-3.5 text-[14px] font-semibold tracking-tight">
        {title}
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
        {children}
      </p>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  tone = "default",
  indent = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "accent" | "muted";
  indent?: boolean;
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
    <div
      className={`flex items-baseline justify-between gap-4 ${
        indent ? "pl-4" : ""
      }`}
    >
      <span className={indent ? "text-ink-3" : "text-ink-2"}>{label}</span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

export default function Landing() {
  const programUrl = getExplorerUrl(
    `/address/${TERMIN_PROGRAM_ADDRESS}`,
    "devnet"
  );
  const programShort = `${TERMIN_PROGRAM_ADDRESS.slice(0, 4)}…${TERMIN_PROGRAM_ADDRESS.slice(-4)}`;

  return (
    <div className="relative min-h-screen">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-texture"
        aria-hidden="true"
      />

      <div className="sticky top-3 z-40 px-4 sm:top-4">
        <nav className="mx-auto flex w-fit max-w-full items-center gap-0.5 rounded-full border border-line bg-surface/85 py-1.5 pl-3 pr-1.5 shadow-card backdrop-blur-md sm:gap-1">
          <Link
            href="/"
            aria-label="termin home"
            className="mr-2 shrink-0 transition hover:opacity-80"
          >
            <Logo />
          </Link>
          <span className="mx-1 hidden h-5 w-px bg-line md:block" />
          <div className="hidden items-center md:flex">
            <a
              href="#problem"
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              The problem
            </a>
            <a
              href="#how"
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              How it works
            </a>
            <a
              href="#investors"
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              For investors
            </a>
          </div>
          <Link
            href="/app"
            className="ml-1 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_20px_-8px_var(--ring)] transition hover:opacity-90 active:scale-[0.98]"
          >
            Open the app
          </Link>
        </nav>
      </div>

      <main className="relative">
        <div className="mx-auto max-w-[1200px] px-4 pt-4 sm:pt-5 lg:px-8">
          <section
            className="relative overflow-hidden rounded-[28px] px-6 pb-28 pt-12 sm:px-10 lg:px-14 lg:pb-36 lg:pt-20"
            style={{ background: HERO_BG }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {CHIPS.map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 font-mono text-[10.5px] tracking-wide text-[#D8F3E6]"
                >
                  {chip.dot ? (
                    <span className="size-1.5 animate-pulse-dot rounded-full bg-[#9FE8C4]" />
                  ) : null}
                  {chip.label}
                </span>
              ))}
            </div>

            <h1 className="font-display mt-7 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[62px]">
              Faktury, które{" "}
              <em className={`${SERIF_ACCENT} text-[#9FE8C4]`}>
                płacą się same
              </em>
              .
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/75">
              Self-collecting B2B invoices on Solana. The buyer signs a payment
              mandate once, and collection happens on its own when the due date
              passes. Late fees enforce themselves on-chain, and investors can
              advance cash against unpaid invoices.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/app" className={HERO_PILL_PRIMARY}>
                Open the app <ArrowRightIcon />
              </Link>
              <a href="#how" className={HERO_PILL_SECONDARY}>
                See how it works
              </a>
            </div>

            <p className="mt-9 font-mono text-[11px] text-white/55">
              Every invoice is a live Solana account ·{" "}
              <a
                href={programUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted underline-offset-2 transition hover:text-white/85"
              >
                program {programShort}
              </a>{" "}
              · no custodian
            </p>
          </section>

          <div className="relative z-10 -mt-20 flex items-start justify-center gap-5 lg:-mt-24">
            <aside className="mt-10 hidden w-44 shrink-0 rounded-[16px] border border-line bg-surface p-3.5 shadow-card lg:block">
              <p className="label-xs">Vault</p>
              <p className="num font-display mt-1.5 text-[15px] font-semibold">
                5,050 tUSD
              </p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                locked until collection
              </p>
            </aside>

            <div className="w-full max-w-[560px] rounded-[20px] border border-line bg-surface p-5 shadow-pop">
              <div className="flex items-center justify-between gap-3">
                <p className="label-xs">Invoice Nº 1005</p>
                <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-warn">
                  Overdue
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <p className="num font-display text-[26px] font-semibold leading-none tracking-tight">
                  5,000.00{" "}
                  <span className="text-[13px] font-medium text-ink-3">
                    tUSD
                  </span>
                </p>
                <p className="num font-mono text-[11px] text-warn">
                  2d 0h late · +50 tUSD fee
                </p>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <span className="label-xs">Late fee meter</span>
                  <span className="num font-mono text-[11px] text-ink-3">
                    +25 tUSD / day
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-[62%] rounded-full bg-warn" />
                </div>
                <p className="num mt-2 font-mono text-[10.5px] text-ink-3">
                  next +25 tUSD in 11:59:42 · fees settle in whole days
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-dashed border-line-strong pt-3 font-mono text-[10.5px] text-ink-3">
                payer 2KzsF…5Dnwq
                <span aria-hidden="true">→</span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">
                  vault
                </span>
                <span aria-hidden="true">→</span>
                issuer HDtQk…5tB3B
              </div>
            </div>

            <aside className="mt-10 hidden w-44 shrink-0 rounded-[16px] border border-line bg-surface p-3.5 shadow-card lg:block">
              <p className="label-xs">Mandate</p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
                active
              </p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                SPL delegate · revocable until due
              </p>
            </aside>
          </div>

          <div className="h-12 lg:h-16" />
        </div>

        <section
          id="problem"
          className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-20 lg:pb-28"
        >
          <p className="label-xs">The problem</p>
          <h2 className="font-display mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-[32px]">
            Payment terms are <em className={SERIF_ACCENT}>polite fiction</em>.
          </h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            <ProblemStat
              value="69%"
              tone="warn"
              note="of Polish companies get paid after the due date: the 2nd worst result in the EU (Intrum European Payment Report)."
            />
            <ProblemStat
              value="30 to 60 days"
              tone="neutral"
              note="of chasing by hand: reminders, phone calls, awkward emails. The invoice asks for payment; nothing enforces it."
            />
            <ProblemStat
              value="2026"
              tone="accent"
              note="KSeF brings mandatory e-invoicing to every Polish business. The moment to automate collection is now."
            />
          </div>
        </section>

        <section
          id="how"
          className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-20 lg:pb-28"
        >
          <p className="label-xs">How it works</p>
          <h2 className="font-display mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-[32px]">
            One signature. Then the chain does the{" "}
            <em className={SERIF_ACCENT}>chasing</em>.
          </h2>

          <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-7">
              <StepItem step="1" title="Issue">
                The seller puts the invoice on-chain: face value, due date, and
                the late-fee schedule. No signup, no accounts.
              </StepItem>
              <StepItem step="2" title="Authorize">
                The buyer signs one payment mandate: an SPL delegate on their
                token account. It can be revoked before the due date, not after.
              </StepItem>
              <StepItem step="3" title="Collect">
                When the due date passes, anyone can trigger collection. Funds
                move from buyer to seller. The late fee accrues daily on a
                transparent schedule and is enforced on-chain.
              </StepItem>
              <StepItem step="4" title="Advance (optional)">
                An investor can pay the seller early. The advance is repaid
                first, with the late fee, when the invoice settles.
              </StepItem>
            </div>

            <div>
              <div className="rounded-[20px] border border-line bg-surface p-5 shadow-card">
                <p className="label-xs">Settlement sample · invoice Nº 1006</p>
                <div className="mt-4 space-y-2 font-mono text-[12px]">
                  <ReceiptRow label="Face value" value="5,000 tUSD" />
                  <ReceiptRow
                    label="LP advance, paid early"
                    value="− 4,800 tUSD"
                    tone="muted"
                  />
                  <ReceiptRow
                    label="Late fee · 0.5%/day · 1 day"
                    value="+ 50 tUSD"
                    tone="warn"
                  />
                  <div className="my-2 border-t border-dashed border-line-strong" />
                  <ReceiptRow label="Buyer pays" value="5,050 tUSD" />
                  <ReceiptRow
                    label="LP repaid first"
                    value="5,000 tUSD"
                    tone="muted"
                    indent
                  />
                  <ReceiptRow
                    label="Seller receives"
                    value="+ 50 tUSD"
                    tone="accent"
                    indent
                  />
                </div>
                <p className="mt-4 border-t border-dashed border-line-strong pt-3 text-[11px] leading-relaxed text-ink-3">
                  The seller already got 4,800 on day one. When the buyer pays
                  5,050, the investor is repaid first and the rest reaches the
                  seller in the same atomic transaction.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20 lg:pb-28">
          <p className="label-xs">Why on-chain</p>
          <h2 className="font-display mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-[32px]">
            Enforced, <em className={SERIF_ACCENT}>not requested</em>.
          </h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={<ZapIcon />} title="Enforced, not requested">
              The mandate is a chain-level delegate. When the due date passes,
              collection needs nobody&apos;s cooperation.
            </FeatureCard>
            <FeatureCard icon={<ClockIcon />} title="A meter, not penalties">
              The late fee accrues by the day on a transparent schedule, capped
              in the contract: no collection agency, no drama.
            </FeatureCard>
            <FeatureCard icon={<CoinsIcon />} title="No backend, no custodian">
              Funds move from buyer to seller (and the investor) directly. The
              app is a window, never a middleman.
            </FeatureCard>
            <FeatureCard icon={<CheckIcon />} title="Observable by default">
              Every invoice, mandate and collection is a live Solana account,
              auditable by anyone, forever.
            </FeatureCard>
          </div>
        </section>

        <section
          id="investors"
          className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-20 lg:pb-28"
        >
          <div
            className="relative overflow-hidden rounded-[28px] border border-[#2a2e32] p-8 lg:p-12"
            style={{
              background:
                "radial-gradient(90% 130% at 94% -20%, rgba(85,196,141,0.18) 0%, transparent 55%), #14171a",
            }}
          >
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#9aa0a5]">
                  For investors (LPs)
                </p>
                <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-[#f6f6f4] sm:text-[32px]">
                  Cheap capital for sellers.
                  <br />
                  <em className={`${SERIF_ACCENT} text-[#55c48d]`}>
                    Real yield
                  </em>{" "}
                  for investors.
                </h2>
                <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-[#9aa0a5]">
                  An LP can advance cash against an authorized invoice at a
                  discount. The advance is repaid first, with the late fee, the
                  moment collection happens. Positions are per-invoice and fully
                  on-chain.
                </p>
              </div>
              <div className="rounded-[18px] border border-[#2a2e32] bg-[#1c1f22] p-5 font-mono text-[12px]">
                <p className="text-[#9aa0a5]">advance 4,800 tUSD today</p>
                <p className="mt-1.5 text-[#9aa0a5]">
                  receive 5,000 tUSD at settlement
                </p>
                <p className="mt-3 border-t border-dashed border-[#32373b] pt-3 text-[#55c48d]">
                  ≈ +4.2% on a 30-day receivable
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[24px] border border-line bg-surface p-8 shadow-card sm:flex-row sm:items-center lg:p-10">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                See it run on devnet.
              </h2>
              <p className="mt-1.5 text-[13px] text-ink-2">
                Connect any Solana wallet and issue your first invoice in 60
                seconds. Live fee meter included.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/app" className={PILL_PRIMARY}>
                Open the app <ArrowRightIcon />
              </Link>
              <a
                href={programUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={PILL_SECONDARY}
              >
                View program
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline">
              Built at HackYeah 2026 · Superteam Poland track
            </span>
          </span>
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>Devnet prototype, not audited</span>
            <span
              className="font-mono"
              title="Reproducible build hash (solana-verify)"
            >
              build 9a44d237…
            </span>
            <a
              href={programUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono transition hover:text-ink"
            >
              Program {programShort}
              <ExternalLinkIcon className="text-[10px] opacity-60" />
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
