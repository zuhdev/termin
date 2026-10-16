"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import type { Instruction, TransactionSigner } from "@solana/kit";
import { createClient } from "@solana/kit-client-rpc";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

/**
 * Returns the wallet signer wrapped with a hook fired the moment signing
 * completes (wallet prompt answered) — used to advance the progress toast from
 * "confirm in wallet" to "submitted". Wallets without signTransaction are
 * passed through unchanged.
 *
 * The wrapped instance must be memoized and reused everywhere: @solana/kit
 * rejects transactions that reference the same address through two different
 * signer instances (payer vs. instruction signer), e.g. invoice issuer = payer.
 */
export function useSendTransaction() {
  const { signer: walletSigner } = useWallet();
  const { cluster } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);
  const onSignedRef = useRef<() => void>(() => {});

  const signer = useMemo((): TransactionSigner | undefined => {
    if (!walletSigner) return undefined;
    if (!("modifyAndSignTransactions" in walletSigner)) return walletSigner;

    const base = walletSigner;
    return {
      ...walletSigner,
      modifyAndSignTransactions: async (txs: readonly unknown[]) => {
        const signed = await base.modifyAndSignTransactions(
          txs as Parameters<typeof base.modifyAndSignTransactions>[0]
        );
        onSignedRef.current();
        return signed;
      },
    } as unknown as TransactionSigner;
  }, [walletSigner]);

  const send = useCallback(
    async ({ instructions }: { instructions: readonly Instruction[] }) => {
      if (!signer) throw new Error("Wallet not connected");

      setIsSending(true);
      const toastId = toast.loading("Confirm in your wallet", {
        description: "Approve the transaction to continue",
      });
      onSignedRef.current = () => {
        toast.loading("Submitted — confirming", {
          id: toastId,
          description: `Waiting for ${cluster} to finalize`,
        });
      };

      try {
        const txClient = createClient({
          url: getClusterUrl(cluster),
          rpcSubscriptionsConfig: getClusterWsConfig(cluster),
          payer: signer,
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

  return { send, isSending, signer };
}
