"use client";

import { useEffect, useState } from "react";
import { useSolanaClient } from "../solana-client-context";
import { useCluster } from "../../components/cluster-context";
import type { ClusterMoniker } from "../solana-client";

export function useSlot(): bigint | undefined {
  const client = useSolanaClient();
  const { cluster } = useCluster();
  const [value, setValue] = useState<{
    cluster: ClusterMoniker;
    slot: bigint;
  }>();

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await client.rpc.getSlot().send();
        if (!cancelled) setValue({ cluster, slot: next });
      } catch {
        // keep the last known slot
      }
    };

    void tick();
    const interval = setInterval(tick, 3_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [client, cluster]);

  return value?.cluster === cluster ? value.slot : undefined;
}
