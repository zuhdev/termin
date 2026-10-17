"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { DEMO_MINT } from "../lib/termin";
import { useCluster } from "./cluster-context";
import { Button } from "./ui";

export function FaucetButton({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const { wallet } = useWallet();
  const { cluster } = useCluster();
  const [requesting, setRequesting] = useState(false);

  const address = wallet?.account.address;
  if (!DEMO_MINT || cluster === "mainnet" || address === undefined) return null;

  const handleRequest = async () => {
    setRequesting(true);
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? "Faucet request failed.");
      }
      toast.success(data.message ?? "Test tUSD received", {
        description:
          "Use it to act as a buyer (authorize & collect) or a lender (advance).",
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Faucet request failed."
      );
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Button
      variant="default"
      size={size}
      loading={requesting}
      onClick={() => void handleRequest()}
      className={className}
      title="Mint 20,000 demo tUSD to your wallet (devnet only)"
    >
      {requesting ? "Minting…" : "Get test tUSD"}
    </Button>
  );
}
