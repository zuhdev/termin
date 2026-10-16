import {
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  lamports,
} from "@solana/kit";
import { createSolanaRpc } from "@solana/kit";
import { sendAndConfirmInstructions } from "../app/lib/send-and-confirm";

const RPC_URL = "https://api.devnet.solana.com";
const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

async function main() {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    new Uint8Array(32).fill(161)
  );
  console.log(`test signer: ${signer.address}`);

  const rpc = createSolanaRpc(RPC_URL);
  try {
    const sig = await rpc
      .requestAirdrop(signer.address, lamports(20_000_000n))
      .send();
    console.log(`airdrop requested: ${sig}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (err) {
    console.log(
      `airdrop failed, checking balance: ${err instanceof Error ? err.message : err}`
    );
    const { value } = await rpc.getBalance(signer.address).send();
    if (value < 5_000_000n) {
      console.log("not funded — aborting");
      return;
    }
    console.log(`already funded: ${value} lamports`);
  }

  const started = Date.now();
  let signedAt: number | undefined;
  const signature = await sendAndConfirmInstructions(
    RPC_URL,
    signer,
    [
      {
        programAddress: MEMO_PROGRAM,
        accounts: [],
        data: new TextEncoder().encode(`termin pipeline test ${started}`),
      },
    ],
    { onSigned: () => (signedAt = Date.now()) }
  );

  console.log(`confirmed: ${signature}`);
  console.log(
    `signed after ${signedAt ? signedAt - started : "?"}ms, confirmed after ${Date.now() - started}ms`
  );
  const { value } = await rpc
    .getSignatureStatuses([signature], { searchTransactionHistory: true })
    .send();
  console.log(
    `status: ${JSON.stringify(value[0]?.confirmationStatus)}, err: ${JSON.stringify(value[0]?.err)}`
  );
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
