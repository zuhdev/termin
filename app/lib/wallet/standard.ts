import { getWallets } from "@wallet-standard/app";
import type { Wallet as StandardWallet } from "@wallet-standard/base";
import {
  StandardConnect,
  StandardDisconnect,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
} from "@wallet-standard/features";
import {
  SolanaSignTransaction,
  SolanaSignAndSendTransaction,
  type SolanaSignTransactionFeature,
  type SolanaSignAndSendTransactionFeature,
} from "@solana/wallet-standard-features";
import type { Address } from "@solana/kit";
import type { ClusterMoniker } from "../solana-client";
import type {
  WalletConnector,
  WalletConnectorMetadata,
  WalletSession,
} from "./types";

// Wallets identify chains either by friendly alias (most wallets) or by
// CAIP-2 genesis-hash reference (MetaMask). When signing, we echo back the
// identifier the account itself advertises so the wallet routes correctly.
const CLUSTER_CHAIN_IDS: Partial<Record<ClusterMoniker, readonly string[]>> = {
  mainnet: [
    "solana:mainnet",
    "solana:mainnet-beta",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  ],
  devnet: ["solana:devnet", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"],
  testnet: ["solana:testnet", "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z"],
};

export function resolveWalletChain(
  cluster: ClusterMoniker,
  accountChains: readonly string[]
): string {
  const candidates = CLUSTER_CHAIN_IDS[cluster];
  if (candidates) {
    const match = accountChains.find((chain) => candidates.includes(chain));
    if (match) return match;
  }
  return `solana:${cluster}`;
}

export function walletSupportsCluster(
  cluster: ClusterMoniker,
  accountChains: readonly string[]
): boolean {
  const candidates = CLUSTER_CHAIN_IDS[cluster];
  if (!candidates || accountChains.length === 0) return true;
  return accountChains.some((chain) => candidates.includes(chain));
}

function isSolanaWallet(wallet: StandardWallet): boolean {
  return (
    StandardConnect in wallet.features &&
    wallet.chains.some((chain) => chain.startsWith("solana:"))
  );
}

function createConnector(wallet: StandardWallet): WalletConnector {
  const metadata: WalletConnectorMetadata = {
    id: wallet.name,
    name: wallet.name,
    icon: wallet.icon,
  };

  return {
    ...metadata,
    connect: async (options) => {
      const connectFeature = wallet.features[
        StandardConnect
      ] as StandardConnectFeature[typeof StandardConnect];
      const { accounts } = await connectFeature.connect(
        options?.silent ? { silent: true } : undefined
      );

      const account = accounts[0] ?? wallet.accounts[0];
      if (!account) throw new Error("No accounts available");

      const walletAccount = {
        address: account.address as Address,
        publicKey: new Uint8Array(account.publicKey),
        label: account.label,
        chains: account.chains,
      };

      const hasSendTx = SolanaSignAndSendTransaction in wallet.features;
      const hasSignTx = SolanaSignTransaction in wallet.features;

      const session: WalletSession = {
        account: walletAccount,
        connector: metadata,
        disconnect: async () => {
          if (StandardDisconnect in wallet.features) {
            const feature = wallet.features[
              StandardDisconnect
            ] as StandardDisconnectFeature[typeof StandardDisconnect];
            await feature.disconnect();
          }
        },
        signTransaction: hasSignTx
          ? async (transaction: Uint8Array, chain: string) => {
              const feature = wallet.features[
                SolanaSignTransaction
              ] as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
              const [result] = await feature.signTransaction({
                account,
                transaction,
                chain: chain as `${string}:${string}`,
              });
              return new Uint8Array(result.signedTransaction);
            }
          : undefined,
        sendTransaction: hasSendTx
          ? async (transaction: Uint8Array, chain: string) => {
              const feature = wallet.features[
                SolanaSignAndSendTransaction
              ] as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction];
              const [result] = await feature.signAndSendTransaction({
                account,
                transaction,
                chain: chain as `${string}:${string}`,
              });
              return new Uint8Array(result.signature);
            }
          : undefined,
      };

      return session;
    },
  };
}

export function discoverWallets(): WalletConnector[] {
  const { get } = getWallets();
  return get().filter(isSolanaWallet).map(createConnector);
}

export function watchWallets(
  onChange: (connectors: WalletConnector[]) => void
): () => void {
  const wallets = getWallets();

  function update() {
    onChange(wallets.get().filter(isSolanaWallet).map(createConnector));
  }

  const offRegister = wallets.on("register", update);
  const offUnregister = wallets.on("unregister", update);
  update();

  return () => {
    offRegister();
    offUnregister();
  };
}
