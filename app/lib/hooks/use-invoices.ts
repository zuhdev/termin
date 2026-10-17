"use client";

import useSWR from "swr";
import type { Account } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { fetchInvoices } from "../termin";
import { fetchMandateStates, type InvoiceMandate } from "../mandates";
import type { Invoice } from "../../generated/termin";

const EMPTY_MANDATES = new Map<string, InvoiceMandate>();

export function useInvoices() {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, isLoading, error, mutate } = useSWR(
    ["invoices", cluster] as const,
    async () => {
      const invoices = await fetchInvoices(client.rpc);
      const mandates = await fetchMandateStates(client.rpc, invoices);
      return { invoices, mandates };
    },
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  return {
    invoices: (data?.invoices ?? []) as Account<Invoice>[],
    mandates: data?.mandates ?? EMPTY_MANDATES,
    isLoading,
    error,
    mutate,
  };
}
