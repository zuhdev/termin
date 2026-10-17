"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import type { Instruction, TransactionSigner } from "@solana/kit";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { sendAndConfirmInstructions } from "../send-and-confirm";

const STILL_WAITING_MS = 30_000;

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
        toast.loading("Submitted, confirming", {
          id: toastId,
          description: `Waiting for ${cluster} to finalize`,
        });
      };
      const stillWaiting = setTimeout(() => {
        toast.loading("Still waiting for wallet approval", {
          id: toastId,
          description: "Check your wallet app and keep this tab open",
        });
      }, STILL_WAITING_MS);

      try {
        const signature = await sendAndConfirmInstructions(
          getClusterUrl(cluster),
          signer,
          instructions,
          { onSigned: () => onSignedRef.current() }
        );
        toast.dismiss(toastId);
        mutate((key: unknown) => Array.isArray(key) && key[0] === "balance");
        return signature;
      } catch (err) {
        toast.dismiss(toastId);
        throw err;
      } finally {
        clearTimeout(stillWaiting);
        setIsSending(false);
      }
    },
    [signer, cluster, mutate]
  );

  return { send, isSending, signer };
}
