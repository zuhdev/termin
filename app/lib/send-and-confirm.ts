import {
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  getBase64EncodedWireTransaction,
  type Instruction,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import { createClient } from "@solana/kit-client-rpc";
import { updateOrAppendSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";

const SEND_RETRIES = 8;
const SEND_RETRY_MS = 600;
const POLL_MS = 1200;
const CONFIRM_TIMEOUT_MS = 75_000;

// The planner inserts a provisory 0-unit compute limit that its executor is
// expected to replace after simulation. We skip the executor, so we set a
// fixed limit here — comfortably above the heaviest termin transaction
// (collect with two ATA initializations, ~70k units).
const COMPUTE_UNIT_LIMIT = 200_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const TX_EXPIRED_MESSAGE =
  "Wallet approval took too long — the transaction expired before it reached the network. Please try again.";

export const WALLET_LOST_MESSAGE =
  "Wallet connection was lost. Reconnect your wallet and try again.";

export class WalletDisconnectedError extends Error {
  constructor() {
    super(WALLET_LOST_MESSAGE);
  }
}

/**
 * Plans, signs, sends and confirms a transaction using HTTP-only RPC
 * (no websocket subscriptions, which are flaky on the public devnet
 * endpoint). The blockhash lifetime window starts right before the wallet
 * prompt; if approval outlives it the transaction can never land, so we
 * surface a clear retry message instead of a raw blockhash error.
 */
export async function sendAndConfirmInstructions(
  rpcUrl: string,
  signer: TransactionSigner,
  instructions: readonly Instruction[],
  options?: { onSigned?: () => void }
): Promise<Signature> {
  const client = createClient({ url: rpcUrl, payer: signer });

  const plannedMessage = await client.planTransaction([...instructions]);
  const message = updateOrAppendSetComputeUnitLimitInstruction(
    COMPUTE_UNIT_LIMIT,
    plannedMessage
  );
  const { value: latestBlockhash } = await client.rpc
    .getLatestBlockhash()
    .send();
  const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
    latestBlockhash,
    message
  );

  let signed;
  try {
    signed = await signTransactionMessageWithSigners(messageWithLifetime);
  } catch (err) {
    throw mapSigningError(err);
  }
  options?.onSigned?.();

  const signature = getSignatureFromTransaction(signed);
  const encoded = getBase64EncodedWireTransaction(signed);

  let lastSendError: unknown;
  for (let attempt = 0; attempt < SEND_RETRIES; attempt++) {
    try {
      await client.rpc.sendTransaction(encoded, { encoding: "base64" }).send();
      lastSendError = undefined;
      break;
    } catch (err) {
      lastSendError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/blockhash not found|blockhashnotfound|node is behind/i.test(msg)) {
        throw err;
      }
      await sleep(SEND_RETRY_MS);
    }
  }
  if (lastSendError !== undefined) {
    throw new Error(TX_EXPIRED_MESSAGE);
  }

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (true) {
    const { value } = await client.rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err !== null && status?.err !== undefined) {
      throw new Error(
        `Transaction failed on-chain: ${JSON.stringify(status.err)} (${signature})`
      );
    }
    if (
      status &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized" ||
        status.confirmations === null)
    ) {
      return signature;
    }

    const blockHeight = await client.rpc.getBlockHeight().send();
    if (blockHeight > latestBlockhash.lastValidBlockHeight) {
      throw new Error(TX_EXPIRED_MESSAGE);
    }
    if (Date.now() > deadline) {
      throw new Error(TX_EXPIRED_MESSAGE);
    }
    await sleep(POLL_MS);
  }
}

function mapSigningError(err: unknown): Error {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/not connected|disconnected|not authorized|unauthorized/i.test(msg)) {
    return new WalletDisconnectedError();
  }
  return err instanceof Error ? err : new Error(msg);
}
