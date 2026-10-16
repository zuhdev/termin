import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";
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
  1: "Insufficient token balance in the payer's account.",
  4: "Token authority mismatch. If this payer authorized a newer invoice with the same token account, the older mandate was replaced — re-authorize and try again.",
  17: "The token account is frozen.",
};

export function parseTransactionError(err: unknown): string {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }

  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    const tokenMessage = SPL_TOKEN_ERRORS[err.context.code];
    if (tokenMessage !== undefined) {
      return tokenMessage;
    }
    const code = TERMIN_ERROR_CODES[err.context.code];
    if (code !== undefined) {
      return getTerminErrorMessage(code);
    }
  }

  const message = getDeepestMessage(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
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
