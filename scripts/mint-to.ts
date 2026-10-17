import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  address,
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  type Address,
} from "@solana/kit";
import { sendAndConfirmInstructions } from "../app/lib/send-and-confirm";
import {
  DEMO_DECIMALS,
  createAtaIdempotentInstruction,
  findAta,
  formatTokenAmount,
  mintToInstruction,
} from "../app/lib/termin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const url =
  process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ??
  "https://api.devnet.solana.com";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [recipientArg, amountArg] = positional;

if (!recipientArg) {
  console.error(`usage: npx tsx scripts/mint-to.ts <recipient> [amount] [--url=…]

Mints demo tUSD from the issuer (mint authority) so that <recipient> holds at
least [amount] tUSD (default 20000). Reads the issuer keypair from
demo-keys/issuer.json and the mint from .env.local (NEXT_PUBLIC_DEMO_MINT).`);
  process.exit(1);
}

function mintFromEnvFile(): Address {
  const envPath = join(ROOT, ".env.local");
  const content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const match = content.match(/^NEXT_PUBLIC_DEMO_MINT=(.+)$/m);
  if (!match) {
    throw new Error(
      "NEXT_PUBLIC_DEMO_MINT not found — run `npm run demo:devnet` first."
    );
  }
  return address(match[1].trim());
}

async function main() {
  const recipient = address(recipientArg);
  const human = Number(amountArg ?? "20000");
  if (!Number.isFinite(human) || human <= 0) {
    throw new Error(`Invalid amount: ${amountArg}`);
  }
  const target = BigInt(Math.round(human * 10 ** DEMO_DECIMALS));
  const mint = process.env.NEXT_PUBLIC_DEMO_MINT
    ? address(process.env.NEXT_PUBLIC_DEMO_MINT)
    : mintFromEnvFile();

  const issuerBytes = Uint8Array.from(
    JSON.parse(
      readFileSync(join(ROOT, "demo-keys", "issuer.json"), "utf8")
    ) as number[]
  );
  const issuer = await createKeyPairSignerFromBytes(issuerBytes);

  const rpc = createSolanaRpc(url);
  const ata = await findAta(recipient, mint);

  let current = 0n;
  try {
    const { value } = await rpc.getTokenAccountBalance(ata).send();
    current = BigInt(value.amount);
  } catch {
    current = 0n;
  }

  const delta = target - current;
  if (delta <= 0n) {
    console.log(
      `${recipient} already holds ${formatTokenAmount(current)} tUSD — nothing to mint.`
    );
    return;
  }

  console.log(`minting ${formatTokenAmount(delta)} tUSD to ${recipient} …`);
  const signature = await sendAndConfirmInstructions(url, issuer, [
    await createAtaIdempotentInstruction(issuer.address, recipient, mint),
    mintToInstruction(mint, ata, issuer, delta),
  ]);
  console.log(`done — tx ${signature}`);
  console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
