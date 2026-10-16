"use client";

import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from "@solana-mobile/wallet-standard-mobile";

let registered = false;

export function registerMobileWalletAdapter() {
  if (registered || typeof window === "undefined") return;
  if (!/android/i.test(navigator.userAgent)) return;
  registered = true;
  try {
    registerMwa({
      appIdentity: {
        name: "termin",
        uri: window.location.origin,
        icon: "/icon.svg",
      },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ["solana:devnet", "solana:mainnet"],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });
  } catch {
    registered = false;
  }
}
