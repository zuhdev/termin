import {
  address,
  type Account,
  type Address,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  findVaultAuthorityPda,
  InvoiceStatus,
  type Invoice,
} from "../generated/termin";
import { ZERO_ADDRESS } from "./termin";

export type MandateHolder = {
  invoice: Address;
  invoiceId: bigint;
};

export type TokenDelegate = {
  delegate: Address | null;
  delegatedAmount: bigint;
};

export type InvoiceMandate = {
  invoiceAddress: Address;
  invoiceId: bigint;
  vaultAuthority: Address;
  delegate: Address | null;
  delegatedAmount: bigint;
  live: boolean;
  displacedBy: MandateHolder | null;
};

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/** Reads delegate + delegatedAmount out of a jsonParsed SPL token account. */
export function parseTokenDelegate(entry: unknown): TokenDelegate | null {
  if (entry === null || typeof entry !== "object") return null;
  const data = (entry as { data?: unknown }).data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const parsed = (data as { parsed?: unknown }).parsed;
  if (parsed === null || typeof parsed !== "object") return null;
  const info = (parsed as { info?: unknown }).info;
  if (info === null || typeof info !== "object") return null;

  const { delegate: delegateRaw, delegatedAmount: amountRaw } = info as {
    delegate?: unknown;
    delegatedAmount?: unknown;
  };

  let delegate: Address | null = null;
  if (typeof delegateRaw === "string") {
    try {
      delegate = address(delegateRaw);
    } catch {
      delegate = null;
    }
  }

  let delegatedAmount = 0n;
  if (amountRaw !== null && typeof amountRaw === "object") {
    delegatedAmount = toBigIntSafe((amountRaw as { amount?: unknown }).amount);
  } else {
    delegatedAmount = toBigIntSafe(amountRaw);
  }

  return { delegate, delegatedAmount };
}

/**
 * Fresh read of the live delegate on a token account — used right before an
 * authorization to detect a mandate swap.
 */
export async function fetchTokenDelegate(
  rpc: Rpc<SolanaRpcApi>,
  tokenAccount: Address
): Promise<TokenDelegate | null> {
  const { value } = await rpc
    .getAccountInfo(tokenAccount, { encoding: "jsonParsed" })
    .send();
  return parseTokenDelegate(value);
}

/**
 * For every Authorized/Overdue invoice, compare the delegate actually set on
 * the payer's token account with the invoice's own vault authority. SPL token
 * accounts hold one delegate, so authorizing a second invoice on the same
 * token account silently replaces the first mandate.
 */
export async function fetchMandateStates(
  rpc: Rpc<SolanaRpcApi>,
  invoices: readonly Account<Invoice>[]
): Promise<Map<string, InvoiceMandate>> {
  const result = new Map<string, InvoiceMandate>();

  const tracked = invoices.filter(
    (inv) =>
      (inv.data.status === InvoiceStatus.Authorized ||
        inv.data.status === InvoiceStatus.Overdue) &&
      inv.data.payerTokenAccount !== ZERO_ADDRESS
  );
  if (tracked.length === 0) return result;

  // Vault authorities are derived for every invoice so a displaced mandate can
  // still be attributed when the displacing invoice was already collected
  // (collection leaves the delegate with a leftover allowance behind).
  const vaults = await Promise.all(
    invoices.map((inv) => findVaultAuthorityPda({ invoice: inv.address }))
  );
  const vaultByInvoice = new Map<string, Address>();
  const vaultHolders = new Map<string, MandateHolder>();
  invoices.forEach((inv, i) => {
    vaultByInvoice.set(inv.address, vaults[i][0]);
    vaultHolders.set(vaults[i][0], {
      invoice: inv.address,
      invoiceId: inv.data.invoiceId,
    });
  });

  const atas = [...new Set(tracked.map((inv) => inv.data.payerTokenAccount))];
  const { value } = await rpc
    .getMultipleAccounts(atas, { encoding: "jsonParsed" })
    .send();
  const entries: ReadonlyArray<unknown> = value;
  const delegatesByAta = new Map<string, TokenDelegate | null>();
  atas.forEach((ata, i) => {
    const entry = entries[i];
    delegatesByAta.set(
      ata,
      entry == null
        ? { delegate: null, delegatedAmount: 0n }
        : parseTokenDelegate(entry)
    );
  });

  tracked.forEach((inv) => {
    const tokenDelegate = delegatesByAta.get(inv.data.payerTokenAccount);
    if (!tokenDelegate) return;

    const vaultAuthority = vaultByInvoice.get(inv.address)!;
    const live =
      tokenDelegate.delegate !== null &&
      tokenDelegate.delegate === vaultAuthority;
    const displacedBy =
      !live && tokenDelegate.delegate !== null
        ? (vaultHolders.get(tokenDelegate.delegate) ?? null)
        : null;

    result.set(inv.address, {
      invoiceAddress: inv.address,
      invoiceId: inv.data.invoiceId,
      vaultAuthority,
      delegate: tokenDelegate.delegate,
      delegatedAmount: tokenDelegate.delegatedAmount,
      live,
      displacedBy,
    });
  });

  return result;
}

/** Finds the invoice whose vault currently owns a delegate address. */
export function findMandateHolderByVault(
  mandates: Map<string, InvoiceMandate>,
  vault: Address
): MandateHolder | null {
  for (const mandate of mandates.values()) {
    if (mandate.vaultAuthority === vault) {
      return { invoice: mandate.invoiceAddress, invoiceId: mandate.invoiceId };
    }
  }
  return null;
}
