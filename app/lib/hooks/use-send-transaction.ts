"use client";

import { useState, useCallback } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import type { Instruction, TransactionSigner } from "@solana/kit";
import { createClient } from "@solana/kit-client-rpc";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

/**
 * Wraps the wallet signer so we get a callback the moment signing completes
 * (wallet prompt answered) — used to advance the progress toast from
 * "confirm in wallet" to "submitted". Wallets without signTransaction are
 * passed through unchanged.
 */
function withSubmitNotice(
  walletSigner: TransactionSigner,
  onSigned: () => void
): TransactionSigner {
  if (!("modifyAndSignTransactions" in walletSigner)) return walletSigner;

  const base = walletSigner;
  return {
    ...walletSigner,
    modifyAndSignTransactions: async (txs: readonly unknown[]) => {
      const signed = await base.modifyAndSignTransactions(
        txs as Parameters<typeof base.modifyAndSignTransactions>[0]
      );
      onSigned();
      return signed;
    },
  } as unknown as TransactionSigner;
}

export function useSendTransaction() {
  const { signer } = useWallet();
  const { cluster } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);

  const send = useCallback(
    async ({ instructions }: { instructions: readonly Instruction[] }) => {
      if (!signer) throw new Error("Wallet not connected");

      setIsSending(true);
      const toastId = toast.loading("Confirm in your wallet", {
        description: "Approve the transaction to continue",
      });

      try {
        const trackedSigner = withSubmitNotice(signer, () => {
          toast.loading("Submitted — confirming", {
            id: toastId,
            description: `Waiting for ${cluster} to finalize`,
          });
        });

        const txClient = createClient({
          url: getClusterUrl(cluster),
          rpcSubscriptionsConfig: getClusterWsConfig(cluster),
          payer: trackedSigner,
        });

        const result = await txClient.sendTransaction([...instructions]);
        toast.dismiss(toastId);
        mutate((key: unknown) => Array.isArray(key) && key[0] === "balance");
        return result.context.signature;
      } catch (err) {
        toast.dismiss(toastId);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [signer, cluster, mutate]
  );

  return { send, isSending };
}
