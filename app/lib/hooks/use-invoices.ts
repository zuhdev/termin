"use client";

import useSWR from "swr";
import type { Account } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { fetchInvoices } from "../termin";
import type { Invoice } from "../../generated/termin";

export function useInvoices() {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, isLoading, error, mutate } = useSWR(
    ["invoices", cluster] as const,
    () => fetchInvoices(client.rpc),
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  return {
    invoices: (data ?? []) as Account<Invoice>[],
    isLoading,
    error,
    mutate,
  };
}
