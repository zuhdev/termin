"use client";

import { useState, useRef, useEffect } from "react";
import { lamports } from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { walletSupportsCluster } from "../lib/wallet/standard";
import { useBalance } from "../lib/hooks/use-balance";
import { useSolanaClient } from "../lib/solana-client-context";
import { lamportsToSolString } from "../lib/lamports";
import { ellipsify } from "../lib/explorer";
import { useCluster } from "./cluster-context";
import { FaucetButton } from "./faucet-button";
import { CopyButton, ExternalLinkIcon, Spinner } from "./ui";

const POPULAR_WALLETS = [
  { name: "Phantom", url: "https://phantom.app/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/download" },
  { name: "Glow", url: "https://glow.app/download" },
  { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet/downloads" },
  { name: "Trust Wallet", url: "https://trustwallet.com/download" },
];

export function WalletButton() {
  const { connectors, connect, disconnect, wallet, status, error } =
    useWallet();

  const { getExplorerUrl, cluster } = useCluster();
  const client = useSolanaClient();
  const [isOpen, setIsOpen] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const address = wallet?.account.address;
  const balance = useBalance(address);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const handleAirdrop = async () => {
    if (!address) return;
    setAirdropping(true);
    try {
      toast.info("Requesting airdrop…");
      await client.rpc.requestAirdrop(address, lamports(1_000_000_000n)).send();
      await new Promise((r) => setTimeout(r, 1_200));
      await balance.mutate();
      toast.success("1 SOL received");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimited =
        msg.includes("429") ||
        msg.includes("Internal JSON-RPC error") ||
        msg.includes("-32603");
      toast.error(isRateLimited ? "Faucet is rate-limited" : "Airdrop failed", {
        description: isRateLimited ? (
          <a
            href="https://faucet.solana.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Open faucet.solana.com
          </a>
        ) : undefined,
      });
    } finally {
      setAirdropping(false);
    }
  };

  if (status !== "connected") {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => (isOpen ? close() : open())}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className="h-9 cursor-pointer rounded-[10px] bg-accent px-3.5 text-xs font-semibold text-accent-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition hover:opacity-90"
        >
          Connect Wallet
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 animate-pop rounded-xl border border-line bg-surface shadow-pop">
            <div className="p-2">
              <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                Detected
              </p>
              {connectors.length > 0 ? (
                <div className="max-h-52 space-y-0.5 overflow-y-auto">
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      onClick={async () => {
                        try {
                          await connect(connector.id);
                          close();
                        } catch {
                          // connection errors are surfaced through context state
                        }
                      }}
                      disabled={status === "connecting"}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-medium transition hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45"
                    >
                      {connector.icon && (
                        // eslint-disable-next-line @next/next/no-img-element -- wallet icons are arbitrary registry URLs, not optimizable via next/image
                        <img
                          src={connector.icon}
                          alt=""
                          className="size-5 rounded"
                        />
                      )}
                      <span>{connector.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-2.5 pb-2 pt-0.5 text-xs leading-relaxed text-ink-3">
                  No wallet detected in this browser yet.
                </p>
              )}
              {status === "connecting" && (
                <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-ink-3">
                  <Spinner /> Connecting…
                </p>
              )}
              {error != null && (
                <p className="px-2.5 py-2 text-xs text-danger">
                  {error instanceof Error ? error.message : String(error)}
                </p>
              )}
            </div>

            <div className="border-t border-line p-2">
              <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                Get a wallet
              </p>
              <div className="grid grid-cols-2 gap-0.5">
                {POPULAR_WALLETS.map((w) => (
                  <a
                    key={w.name}
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-[12px] font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
                  >
                    {w.name}
                    <ExternalLinkIcon className="shrink-0 text-[10px] opacity-40" />
                  </a>
                ))}
              </div>
              <p className="mt-1.5 border-t border-line px-2.5 pb-1 pt-2.5 text-[10px] leading-snug text-ink-3">
                Any Solana Wallet Standard wallet works: Phantom, Solflare,
                Backpack and 20+ more. On Android, Mobile Wallet Adapter is
                detected automatically.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (isOpen ? close() : open())}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      >
        <span className="size-1.5 rounded-full bg-accent" />
        <span className="font-mono">{ellipsify(address!, 4)}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 animate-pop rounded-xl border border-line bg-surface p-4 shadow-pop">
          <div>
            <p className="label-xs">Balance</p>
            <p className="num mt-1.5 text-lg font-semibold">
              {balance.lamports != null
                ? lamportsToSolString(balance.lamports)
                : "—"}{" "}
              <span className="text-xs font-normal text-ink-3">SOL</span>
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2">
            <span className="break-all font-mono text-[11px] text-ink-2">
              {address}
            </span>
            <CopyButton value={address!} />
          </div>

          {!walletSupportsCluster(cluster, wallet!.account.chains) && (
            <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger">
              This wallet is on a different network. Switch it to {cluster} in
              the wallet app, or signing requests will target the wrong network.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <a
              href={getExplorerUrl(`/address/${address}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-2"
            >
              Explorer
              <ExternalLinkIcon className="text-[10px] opacity-60" />
            </a>
            {cluster !== "mainnet" && (
              <button
                onClick={handleAirdrop}
                disabled={airdropping}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45"
              >
                {airdropping ? (
                  <>
                    <Spinner /> Wait…
                  </>
                ) : (
                  "Airdrop 1 SOL"
                )}
              </button>
            )}
          </div>

          <FaucetButton className="mt-2 w-full" />

          <button
            onClick={() => {
              disconnect();
              close();
            }}
            className="mt-2 w-full cursor-pointer rounded-[10px] px-3 py-2 text-xs font-medium text-danger transition hover:bg-danger-soft"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
