import { SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM } from "@solana/kit";
import {
  getTerminErrorMessage,
  TERMIN_ERROR__INVALID_AMOUNT,
  TERMIN_ERROR__INVALID_FEE_CONFIG,
  TERMIN_ERROR__INVALID_DUE_DATE,
  TERMIN_ERROR__INVALID_STATUS,
  TERMIN_ERROR__NOT_YET_DUE,
  TERMIN_ERROR__REVOKE_WINDOW_CLOSED,
  TERMIN_ERROR__ADVANCE_OUTSTANDING,
  TERMIN_ERROR__ADVANCE_ALREADY_EXISTS,
  TERMIN_ERROR__INVALID_ADVANCE,
  TERMIN_ERROR__INVALID_TOKEN_ACCOUNT,
  TERMIN_ERROR__MATH_OVERFLOW,
  type TerminError,
} from "../generated/termin";

const TERMIN_ERROR_CODES: Record<number, TerminError> = {
  [TERMIN_ERROR__INVALID_AMOUNT]: TERMIN_ERROR__INVALID_AMOUNT,
  [TERMIN_ERROR__INVALID_FEE_CONFIG]: TERMIN_ERROR__INVALID_FEE_CONFIG,
  [TERMIN_ERROR__INVALID_DUE_DATE]: TERMIN_ERROR__INVALID_DUE_DATE,
  [TERMIN_ERROR__INVALID_STATUS]: TERMIN_ERROR__INVALID_STATUS,
  [TERMIN_ERROR__NOT_YET_DUE]: TERMIN_ERROR__NOT_YET_DUE,
  [TERMIN_ERROR__REVOKE_WINDOW_CLOSED]: TERMIN_ERROR__REVOKE_WINDOW_CLOSED,
  [TERMIN_ERROR__ADVANCE_OUTSTANDING]: TERMIN_ERROR__ADVANCE_OUTSTANDING,
  [TERMIN_ERROR__ADVANCE_ALREADY_EXISTS]: TERMIN_ERROR__ADVANCE_ALREADY_EXISTS,
  [TERMIN_ERROR__INVALID_ADVANCE]: TERMIN_ERROR__INVALID_ADVANCE,
  [TERMIN_ERROR__INVALID_TOKEN_ACCOUNT]: TERMIN_ERROR__INVALID_TOKEN_ACCOUNT,
  [TERMIN_ERROR__MATH_OVERFLOW]: TERMIN_ERROR__MATH_OVERFLOW,
};

const SPL_TOKEN_ERRORS: Record<number, string> = {
  1: "Insufficient tUSD balance: the account that pays for this action doesn't have enough demo tUSD. Use the faucet to top it up.",
  4: "Token authority mismatch. The paying account no longer delegates to this invoice. If the buyer authorized a newer invoice with the same token account, the older mandate was replaced.",
  17: "The token account is frozen.",
};

export function parseTransactionError(err: unknown): string {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }

  const customCode = findCustomProgramErrorCode(err);
  if (customCode !== undefined) {
    const tokenMessage = SPL_TOKEN_ERRORS[customCode];
    if (tokenMessage !== undefined) return tokenMessage;
    const terminError = TERMIN_ERROR_CODES[customCode];
    if (terminError !== undefined) return getTerminErrorMessage(terminError);
  }

  const message = getDeepestMessage(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

/**
 * Extracts a custom program error code from wallet- or RPC-shaped errors.
 * Same-realm SolanaError instances expose it on `context`; wallets that
 * bundle their own copy of @solana/errors only surface the old message
 * format ("Solana error #4615026; Decode this error by running …") which
 * embeds the context as base64 — decode that as a fallback.
 */
function findCustomProgramErrorCode(
  err: unknown,
  depth = 0
): number | undefined {
  if (depth > 4 || err === null || typeof err !== "object") return undefined;
  const candidate = err as {
    context?: unknown;
    message?: unknown;
    cause?: unknown;
  };

  const context = candidate.context;
  if (context !== null && typeof context === "object") {
    const ctx = context as Record<string, unknown>;
    if (
      typeof ctx.code === "number" &&
      Number.isInteger(ctx.code) &&
      (ctx.__code === SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM ||
        typeof ctx.index === "number")
    ) {
      return ctx.code;
    }
  }

  if (typeof candidate.message === "string") {
    const fromHint = codeFromDecodeHint(candidate.message);
    if (fromHint !== undefined) return fromHint;
    const fromText = candidate.message.match(/custom program error: #(\d+)/);
    if (fromText) return Number(fromText[1]);
  }

  return findCustomProgramErrorCode(candidate.cause, depth + 1);
}

function codeFromDecodeHint(message: string): number | undefined {
  if (!message.includes("Decode this error by running")) return undefined;
  const match = message.match(/['"]([A-Za-z0-9+/=]{8,})['"]/);
  if (!match) return undefined;
  try {
    const params = new URLSearchParams(atob(match[1]));
    const raw = params.get("code");
    if (raw === null) return undefined;
    const code = Number(raw);
    if (Number.isInteger(code) && code >= 0) return code;
  } catch {
    // not a decodable context blob
  }
  return undefined;
}

function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;

  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) {
      deepest = current.message;
    }
  }

  return deepest;
}
