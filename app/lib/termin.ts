import {
  address,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  type Account,
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  decodeInvoice,
  TERMIN_PROGRAM_ADDRESS,
  type Invoice,
} from "../generated/termin";

export { TERMIN_PROGRAM_ADDRESS };

export const TOKEN_PROGRAM_ADDRESS = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const ATA_PROGRAM_ADDRESS = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
export const SYSTEM_PROGRAM_ADDRESS = address(
  "11111111111111111111111111111111"
);
export const ZERO_ADDRESS = address("11111111111111111111111111111111");

export const BPS_DENOMINATOR = 10_000n;
export const SECONDS_PER_DAY = 86_400;
export const DEMO_DECIMALS = 6;

export const DEMO_MINT: Address | undefined = process.env.NEXT_PUBLIC_DEMO_MINT
  ? address(process.env.NEXT_PUBLIC_DEMO_MINT)
  : undefined;

export async function findAta(owner: Address, mint: Address): Promise<Address> {
  const [ata] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM_ADDRESS,
    seeds: [
      getAddressEncoder().encode(owner),
      getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS),
      getAddressEncoder().encode(mint),
    ],
  });
  return ata;
}

export async function createAtaIdempotentInstruction(
  payer: Address,
  owner: Address,
  mint: Address
): Promise<Instruction> {
  const ata = await findAta(owner, mint);
  return {
    programAddress: ATA_PROGRAM_ADDRESS,
    accounts: [
      { address: payer, role: 3 },
      { address: ata, role: 1 },
      { address: owner, role: 0 },
      { address: mint, role: 0 },
      { address: SYSTEM_PROGRAM_ADDRESS, role: 0 },
      { address: TOKEN_PROGRAM_ADDRESS, role: 0 },
    ],
    data: new Uint8Array([1]),
  };
}

export function formatTokenAmount(
  amount: bigint,
  decimals = DEMO_DECIMALS
): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  const wholeStr = whole.toLocaleString("en-US");
  if (frac === 0n) return wholeStr;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${wholeStr}.${fracStr}`;
}

export function parseTokenAmount(
  input: string,
  decimals = DEMO_DECIMALS
): bigint {
  const value = Number.parseFloat(input);
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return BigInt(Math.round(value * 10 ** decimals));
}

export function projectedFee(invoice: Invoice, nowSec: number): bigint {
  if (BigInt(nowSec) <= invoice.dueTs) return 0n;
  const days =
    BigInt(Math.floor(nowSec - Number(invoice.dueTs))) /
    BigInt(SECONDS_PER_DAY);
  const raw =
    (invoice.amount * BigInt(invoice.feeBpsPerDay) * days) / BPS_DENOMINATOR;
  const cap = (invoice.amount * BigInt(invoice.feeCapBps)) / BPS_DENOMINATOR;
  return raw < cap ? raw : cap;
}

/** Fee accrual rate in tUSD units per second (display only — settles in whole days). */
export function feePerSecond(invoice: Invoice): number {
  return (
    (Number(invoice.amount) / 10 ** DEMO_DECIMALS) *
    (invoice.feeBpsPerDay / (Number(BPS_DENOMINATOR) * SECONDS_PER_DAY))
  );
}

/** Seconds until the next whole-day fee increment (0 when not overdue). */
export function secondsToNextFeeIncrement(
  invoice: Invoice,
  nowSec: number
): number {
  const diff = nowSec - Number(invoice.dueTs);
  if (diff <= 0) return 0;
  return SECONDS_PER_DAY - (diff % SECONDS_PER_DAY);
}

export function formatTs(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export async function fetchInvoices(
  rpc: Rpc<SolanaRpcApi>
): Promise<Account<Invoice>[]> {
  const accounts = await rpc
    .getProgramAccounts(TERMIN_PROGRAM_ADDRESS, { encoding: "base64" })
    .send();

  const invoices = accounts.map(({ pubkey, account }) => {
    const data = getBase64Encoder().encode(account.data[0] as string);
    return decodeInvoice({
      address: pubkey,
      data,
      executable: account.executable,
      lamports: account.lamports,
      programAddress: account.owner,
      space: BigInt(data.length),
    });
  });

  return invoices.sort((a, b) =>
    b.data.createdTs > a.data.createdTs
      ? 1
      : b.data.createdTs < a.data.createdTs
        ? -1
        : 0
  );
}
