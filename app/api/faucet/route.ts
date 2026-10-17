import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  address,
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  type Address,
} from "@solana/kit";
import { sendAndConfirmInstructions } from "../../lib/send-and-confirm";
import {
  DEMO_DECIMALS,
  DEMO_MINT,
  createAtaIdempotentInstruction,
  findAta,
  formatTokenAmount,
  mintToInstruction,
} from "../../lib/termin";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEVNET_URL = "https://api.devnet.solana.com";
const TOP_UP = 20_000n * 10n ** BigInt(DEMO_DECIMALS);
const COOLDOWN_MS = 60_000;
const lastRequestByIp = new Map<string, number>();

/**
 * The issuer keypair is the demo mint's authority. On Vercel it is provided
 * via FAUCET_SECRET_KEY (same JSON array format as demo-keys/issuer.json);
 * locally we fall back to the gitignored demo key file.
 */
async function loadIssuer() {
  const fromEnv = process.env.FAUCET_SECRET_KEY;
  if (fromEnv) {
    return createKeyPairSignerFromBytes(
      Uint8Array.from(JSON.parse(fromEnv) as number[])
    );
  }
  const path = join(process.cwd(), "demo-keys", "issuer.json");
  const bytes = Uint8Array.from(
    JSON.parse(await readFile(path, "utf8")) as number[]
  );
  return createKeyPairSignerFromBytes(bytes);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const rawAddress = (body as { address?: unknown } | null)?.address;
  if (typeof rawAddress !== "string") {
    return Response.json(
      { ok: false, error: "Missing wallet address." },
      { status: 400 }
    );
  }
  let owner: Address;
  try {
    owner = address(rawAddress);
  } catch {
    return Response.json(
      { ok: false, error: "That does not look like a Solana address." },
      { status: 400 }
    );
  }

  if (!DEMO_MINT) {
    return Response.json(
      { ok: false, error: "Demo token is not configured." },
      { status: 500 }
    );
  }

  let issuer;
  try {
    issuer = await loadIssuer();
  } catch {
    return Response.json(
      { ok: false, error: "Faucet is not configured on this deployment." },
      { status: 500 }
    );
  }

  const rpc = createSolanaRpc(DEVNET_URL);
  const ata = await findAta(owner, DEMO_MINT);
  let current = 0n;
  try {
    const { value } = await rpc.getTokenAccountBalance(ata).send();
    current = BigInt(value.amount);
  } catch {
    current = 0n;
  }

  const delta = TOP_UP - current;
  if (delta <= 0n) {
    return Response.json({
      ok: true,
      message: `This wallet already holds ${formatTokenAmount(current)} test tUSD.`,
    });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  if (now - (lastRequestByIp.get(ip) ?? 0) < COOLDOWN_MS) {
    return Response.json(
      {
        ok: false,
        error: "One faucet request per minute — try again shortly.",
      },
      { status: 429 }
    );
  }
  if (lastRequestByIp.size > 1_000) {
    for (const [key, ts] of lastRequestByIp) {
      if (now - ts > COOLDOWN_MS) lastRequestByIp.delete(key);
    }
  }
  lastRequestByIp.set(ip, now);

  try {
    const signature = await sendAndConfirmInstructions(DEVNET_URL, issuer, [
      await createAtaIdempotentInstruction(issuer.address, owner, DEMO_MINT),
      mintToInstruction(DEMO_MINT, ata, issuer, delta),
    ]);
    return Response.json({
      ok: true,
      message: `Minted ${formatTokenAmount(delta)} test tUSD.`,
      signature,
    });
  } catch {
    lastRequestByIp.delete(ip);
    return Response.json(
      { ok: false, error: "Minting failed — please try again in a moment." },
      { status: 502 }
    );
  }
}
