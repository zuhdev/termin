import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@solana/kit-client-rpc";
import {
  AccountRole,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getBase58Decoder,
  lamports,
  type AccountSignerMeta,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  fetchMaybeInvoice,
  findInvoicePda,
  getAdvanceInvoiceInstruction,
  getAuthorizeInvoiceInstructionAsync,
  getCollectInvoiceInstructionAsync,
  getCreateInvoiceInstructionAsync,
} from "../app/generated/termin";
import {
  DEMO_DECIMALS,
  SYSTEM_PROGRAM_ADDRESS,
  TERMIN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  createAtaIdempotentInstruction,
  findAta,
  formatTokenAmount,
} from "../app/lib/termin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const KEYS_DIR = join(ROOT, "demo-keys");

const url =
  process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ??
  "http://localhost:8899";
const ws =
  process.argv.find((a) => a.startsWith("--ws="))?.split("=")[1] ??
  (url.includes("localhost") ? "ws://localhost:8900" : undefined);
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

const TOKEN = 10n ** BigInt(DEMO_DECIMALS);

type Kp = { signer: TransactionSigner; secret: Uint8Array };

async function loadOrCreateKeypair(name: string): Promise<Kp> {
  mkdirSync(KEYS_DIR, { recursive: true });
  const path = join(KEYS_DIR, `${name}.json`);
  if (existsSync(path)) {
    const bytes = Uint8Array.from(
      JSON.parse(readFileSync(path, "utf8")) as number[]
    );
    return { signer: await createKeyPairSignerFromBytes(bytes), secret: bytes };
  }
  const seed = randomBytes(32);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const secret = new Uint8Array(64);
  secret.set(seed, 0);
  secret.set(getAddressEncoder().encode(signer.address), 32);
  writeFileSync(path, JSON.stringify(Array.from(secret)));
  return { signer, secret };
}

function sysCreateAccount(
  payer: Address,
  newAccount: TransactionSigner,
  space: bigint,
  rent: bigint,
  owner: Address
): Instruction {
  const data = new Uint8Array(52);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, 0, true);
  dv.setBigUint64(4, rent, true);
  dv.setBigUint64(12, space, true);
  data.set(getAddressEncoder().encode(owner), 20);
  return {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      {
        address: newAccount.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: newAccount,
      } as AccountSignerMeta,
    ],
    data,
  };
}

function initMint2(
  mint: Address,
  decimals: number,
  authority: Address
): Instruction {
  const data = new Uint8Array(35);
  data[0] = 20;
  data[1] = decimals;
  data.set(getAddressEncoder().encode(authority), 2);
  data[34] = 0;
  return {
    programAddress: TOKEN_PROGRAM_ADDRESS,
    accounts: [{ address: mint, role: AccountRole.WRITABLE }],
    data,
  };
}

function mintTo(
  mint: Address,
  dest: Address,
  authority: TransactionSigner,
  amount: bigint
): Instruction {
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  data[0] = 7;
  dv.setBigUint64(1, amount, true);
  return {
    programAddress: TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: mint, role: AccountRole.WRITABLE },
      { address: dest, role: AccountRole.WRITABLE },
      {
        address: authority.address,
        role: AccountRole.READONLY_SIGNER,
        signer: authority,
      } as AccountSignerMeta,
    ],
    data,
  };
}

function writeEnvLocal(mint: Address) {
  const path = join(ROOT, ".env.local");
  const line = `NEXT_PUBLIC_DEMO_MINT=${mint}`;
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/^NEXT_PUBLIC_DEMO_MINT=.*$/m.test(content)) {
    content = content.replace(/^NEXT_PUBLIC_DEMO_MINT=.*$/m, line);
  } else {
    content = content.trimEnd() + (content.trim() ? "\n" : "") + line + "\n";
  }
  writeFileSync(path, content);
}

async function main() {
  console.log(`\ntermin demo seeder — ${url}\n`);

  const issuer = await loadOrCreateKeypair("issuer");
  const payerA = await loadOrCreateKeypair("payer");
  const payerB = await loadOrCreateKeypair("payerB");
  const payerC = await loadOrCreateKeypair("payerC");
  const lp = await loadOrCreateKeypair("lp");
  const mintKp = await loadOrCreateKeypair("mint");
  const mint = mintKp.signer.address;

  const client = createClient({
    url,
    rpcSubscriptionsConfig: ws ? { url: ws } : undefined,
    payer: issuer.signer,
  });

  console.log(`issuer  : ${issuer.signer.address}`);
  console.log(`payer A : ${payerA.signer.address}`);
  console.log(`payer B : ${payerB.signer.address}`);
  console.log(`payer C : ${payerC.signer.address}`);
  console.log(`lp      : ${lp.signer.address}`);
  console.log(`mint    : ${mint}\n`);

  let balance = (await client.rpc.getBalance(issuer.signer.address).send())
    .value;
  if (balance < lamports(100_000_000n)) {
    const amount = isLocal ? 5 : 2;
    try {
      await client.rpc
        .requestAirdrop(
          issuer.signer.address,
          lamports(BigInt(amount) * 1_000_000_000n)
        )
        .send();
      console.log(`requested airdrop of ${amount} SOL`);
    } catch (err) {
      console.log(
        `airdrop failed: ${err instanceof Error ? err.message : err}`
      );
    }
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      balance = (await client.rpc.getBalance(issuer.signer.address).send())
        .value;
      if (balance >= lamports(100_000_000n)) break;
    }
  }
  console.log(`issuer balance: ${Number(balance) / 1e9} SOL`);
  if (balance < lamports(10_000_000n)) {
    console.error(
      `\nFUND THIS ADDRESS, THEN RERUN:\n  ${issuer.signer.address}\n` +
        `suggested: solana airdrop 2 ${issuer.signer.address} --url ${url}\n` +
        `or web faucet: https://faucet.solana.com/\n`
    );
    process.exit(1);
  }

  const mintInfo = (
    await client.rpc.getAccountInfo(mint, { encoding: "base64" }).send()
  ).value;
  if (!mintInfo) {
    console.log("creating mint...");
    const rent = await client.rpc.getMinimumBalanceForRentExemption(82n).send();
    await client.sendTransaction([
      sysCreateAccount(
        issuer.signer.address,
        mintKp.signer,
        82n,
        rent,
        TOKEN_PROGRAM_ADDRESS
      ),
      initMint2(mint, DEMO_DECIMALS, issuer.signer.address),
    ]);
    console.log("mint created");
  }
  writeEnvLocal(mint);

  const issuerAta = await findAta(issuer.signer.address, mint);
  const payerAta = await findAta(payerA.signer.address, mint);
  const payerBAta = await findAta(payerB.signer.address, mint);
  const payerCAta = await findAta(payerC.signer.address, mint);
  const lpAta = await findAta(lp.signer.address, mint);

  const setupIxs: Instruction[] = [];
  for (const [owner, ata] of [
    [issuer.signer.address, issuerAta],
    [payerA.signer.address, payerAta],
    [payerB.signer.address, payerBAta],
    [payerC.signer.address, payerCAta],
    [lp.signer.address, lpAta],
  ] as const) {
    const info = (
      await client.rpc.getAccountInfo(ata, { encoding: "base64" }).send()
    ).value;
    if (!info) {
      setupIxs.push(
        await createAtaIdempotentInstruction(issuer.signer.address, owner, mint)
      );
    }
  }

  async function topUp(ata: Address, label: string, desired: bigint) {
    let current = 0n;
    try {
      const { value } = await client.rpc.getTokenAccountBalance(ata).send();
      current = BigInt(value.amount);
    } catch {
      current = 0n;
    }
    if (current < desired) {
      setupIxs.push(mintTo(mint, ata, issuer.signer, desired - current));
      console.log(
        `minting ${Number(desired - current) / 10 ** DEMO_DECIMALS} to ${label}`
      );
    }
  }

  await topUp(payerAta, "payer A", 20_000n * TOKEN);
  await topUp(payerBAta, "payer B", 20_000n * TOKEN);
  await topUp(payerCAta, "payer C", 20_000n * TOKEN);
  await topUp(lpAta, "lp", 10_000n * TOKEN);

  if (setupIxs.length > 0) {
    await client.sendTransaction(setupIxs);
    console.log("setup transaction sent");
  }

  const base = BigInt(
    process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ?? "1001"
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const invoices = [
    {
      id: base,
      payer: payerB,
      payerAta: payerBAta,
      dueOffset: 240,
      authorize: false,
      advance: false,
      note: "Created — authorize from the UI",
    },
    {
      id: base + 1n,
      payer: payerA,
      payerAta: payerAta,
      dueOffset: -2 * 86_400,
      authorize: true,
      advance: false,
      note: "Authorized 2 days overdue — collect from the UI",
    },
    {
      id: base + 2n,
      payer: payerC,
      payerAta: payerCAta,
      dueOffset: 60,
      authorize: true,
      advance: true,
      note: "Authorized + LP advance — collect at due",
    },
  ];
  const amount = 5_000n * TOKEN;
  const feeBpsPerDay = 50;
  const feeCapBps = 1_000;

  for (const inv of invoices) {
    const [invoicePda] = await findInvoicePda({
      issuer: issuer.signer.address,
      invoiceId: inv.id,
    });
    if ((await fetchMaybeInvoice(client.rpc, invoicePda)).exists) {
      console.log(`invoice ${inv.id} already exists: ${invoicePda}`);
      continue;
    }
    const ixs: Instruction[] = [
      await getCreateInvoiceInstructionAsync({
        issuer: issuer.signer,
        payer: inv.payer.signer.address,
        mint,
        invoiceId: inv.id,
        amount,
        dueTs: BigInt(nowSec + inv.dueOffset),
        feeBpsPerDay,
        feeCapBps,
        reference: randomBytes(32),
      }),
    ];
    if (inv.authorize) {
      ixs.push(
        await getAuthorizeInvoiceInstructionAsync({
          payer: inv.payer.signer,
          mint,
          invoice: invoicePda,
          payerTokenAccount: inv.payerAta,
        })
      );
    }
    if (inv.advance) {
      ixs.push(
        getAdvanceInvoiceInstruction({
          lp: lp.signer,
          mint,
          invoice: invoicePda,
          lpTokenAccount: lpAta,
          issuerTokenAccount: issuerAta,
          amountIn: 4_800n * TOKEN,
          payout: amount,
        })
      );
    }
    const result = await client.sendTransaction(ixs);
    console.log(
      `invoice ${inv.id} seeded (${inv.note})\n  pda: ${invoicePda}\n  sig: ${result.context.signature}`
    );
  }

  const collectArg = process.argv
    .find((a) => a.startsWith("--collect="))
    ?.split("=")[1];
  if (collectArg) {
    const id = BigInt(collectArg);
    const [invoicePda] = await findInvoicePda({
      issuer: issuer.signer.address,
      invoiceId: id,
    });
    const maybe = await fetchMaybeInvoice(client.rpc, invoicePda);
    if (!maybe.exists) throw new Error(`invoice ${id} not found`);
    const data = maybe.data;
    const tokenBal = async (ata: Address) =>
      BigInt(
        (await client.rpc.getTokenAccountBalance(ata).send()).value.amount
      );
    const issuerBefore = await tokenBal(issuerAta);
    const lpBefore = await tokenBal(lpAta);
    const collectLpAta =
      data.advancePayout > 0n ? await findAta(data.lp, mint) : payerAta;
    const ix = await getCollectInvoiceInstructionAsync({
      mint,
      invoice: invoicePda,
      payerTokenAccount: data.payerTokenAccount,
      issuerTokenAccount: issuerAta,
      lpTokenAccount: collectLpAta,
    });
    const result = await client.sendTransaction([ix]);
    const after = await fetchMaybeInvoice(client.rpc, invoicePda);
    console.log(`\ncollected invoice ${id}`);
    if (after.exists) {
      console.log(`  status: ${after.data.status}`);
      console.log(`  fee paid: ${formatTokenAmount(after.data.feePaid)}`);
    }
    console.log(
      `  issuer balance: ${formatTokenAmount(await tokenBal(issuerAta))} (was ${formatTokenAmount(issuerBefore)})`
    );
    console.log(
      `  lp balance: ${formatTokenAmount(await tokenBal(lpAta))} (was ${formatTokenAmount(lpBefore)})`
    );
    console.log(`  sig: ${result.context.signature}`);
  }

  console.log(`\n--- ready ---`);
  console.log(`program : ${TERMIN_PROGRAM_ADDRESS}`);
  console.log(
    `mint    : ${mint} (NEXT_PUBLIC_DEMO_MINT written to .env.local)`
  );
  console.log(`\nPhantom import secrets (base58):`);
  for (const [name, kp] of [
    ["issuer", issuer],
    ["payerA", payerA],
    ["payerB", payerB],
    ["payerC", payerC],
    ["lp", lp],
  ] as const) {
    console.log(`  ${name}: ${getBase58Decoder().decode(kp.secret)}`);
  }
  console.log(
    `\ndemo flow: collect ${base + 1n} (fee accrues), authorize ${base} in the UI then collect, collect ${base + 2n} (LP waterfall).`
  );
  console.log(
    `note: one SPL delegate slot per token account — each payer here has one active mandate.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
