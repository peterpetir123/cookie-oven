/**
 * Wallet connection over the Wallet Standard.
 *
 * Deliberately not `@solana/wallet-adapter-react`: that package drags in a registry of every wallet
 * ever shipped, which is both a large bundle and — as of writing — an install that fails outright
 * because one transitive dependency is no longer on the registry. Wallet Standard is the protocol
 * Nightly actually implements, so talking to it directly is less code, fewer moving parts, and one
 * less thing that can break between here and a judge's browser.
 *
 * Nightly is highlighted because it is the wallet Cookie Chain supports, and because it exposes a
 * `changeNetwork` extension that saves the user from adding a custom RPC by hand. Any Wallet
 * Standard wallet works; it just may need that manual step, which `NeedsNetworkHint` in the UI
 * covers.
 */

import { getWallets } from "@wallet-standard/app";
import type {
  Wallet,
  WalletAccount,
} from "@wallet-standard/base";

export interface ConnectedWallet {
  wallet: Wallet;
  account: WalletAccount;
  address: string;
}

/** Feature names we actually use. A wallet missing any of them cannot drive this app. */
const FEATURES = {
  connect: "standard:connect",
  disconnect: "standard:disconnect",
  events: "standard:events",
  signTransaction: "solana:signTransaction",
  signMessage: "solana:signMessage",
} as const;

/**
 * Chains we will accept a wallet on.
 *
 * Cookie Chain is an independent SVM network with its own genesis, but wallets that support custom
 * SVM networks still advertise under the Solana chain namespace — there is no registered
 * `cookie:` chain identifier. Accepting the Solana namespace is therefore the only workable filter,
 * and the real safety check is `assertCookieChain()` plus the fact that the transaction is built
 * against Cookie Chain's blockhash and can never confirm anywhere else.
 */
const CHAIN_PREFIX = "solana:";

export interface WalletOption {
  wallet: Wallet;
  name: string;
  icon?: string;
  /** True for Nightly, which Cookie Chain supports first-class. */
  recommended: boolean;
}

export function discoverWallets(): WalletOption[] {
  const { get } = getWallets();
  return get()
    .filter((w) => supports(w))
    .map((w) => ({
      wallet: w,
      name: w.name,
      icon: w.icon,
      recommended: /nightly/i.test(w.name),
    }))
    // Nightly first, then alphabetical — the recommended option should not be something the user
    // has to hunt for in a list.
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name));
}

/** Subscribe to wallets registering and unregistering. Returns an unsubscribe function. */
export function onWalletsChanged(cb: () => void): () => void {
  const { on } = getWallets();
  const offRegister = on("register", cb);
  const offUnregister = on("unregister", cb);
  return () => {
    offRegister();
    offUnregister();
  };
}

function supports(w: Wallet): boolean {
  const f = w.features as Record<string, unknown>;
  const hasChain = w.chains.some((c) => c.startsWith(CHAIN_PREFIX));
  return (
    hasChain &&
    !!f[FEATURES.connect] &&
    !!f[FEATURES.signTransaction] &&
    !!f[FEATURES.signMessage]
  );
}

interface ConnectFeature {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>;
}
interface DisconnectFeature {
  disconnect(): Promise<void>;
}
interface SignTxFeature {
  signTransaction(input: {
    account: WalletAccount;
    transaction: Uint8Array;
    chain?: string;
  }): Promise<{ signedTransaction: Uint8Array }[]>;
}
interface SignMessageFeature {
  signMessage(input: {
    account: WalletAccount;
    message: Uint8Array;
  }): Promise<{ signedMessage: Uint8Array; signature: Uint8Array }[]>;
}

/** Pick the account to act as. Prefers one on a Solana chain, else the first. */
function pickAccount(w: Wallet): WalletAccount | undefined {
  return (
    w.accounts.find((a) => a.chains.some((c) => c.startsWith(CHAIN_PREFIX))) ?? w.accounts[0]
  );
}

export async function connect(w: Wallet, silent = false): Promise<ConnectedWallet> {
  const feature = (w.features as Record<string, unknown>)[FEATURES.connect] as
    | ConnectFeature
    | undefined;
  if (!feature) throw new Error(`${w.name} does not support connecting.`);

  await feature.connect(silent ? { silent: true } : undefined);

  const account = pickAccount(w);
  if (!account) {
    throw new Error(
      `${w.name} connected but returned no account. Open the wallet and approve the connection.`,
    );
  }
  return { wallet: w, account, address: account.address };
}

export async function disconnect(w: Wallet): Promise<void> {
  const feature = (w.features as Record<string, unknown>)[FEATURES.disconnect] as
    | DisconnectFeature
    | undefined;
  if (feature) await feature.disconnect();
}

/**
 * Ask the wallet to switch to Cookie Chain, where it knows how.
 *
 * Nightly exposes this as a non-standard extension. Wallets that do not have it are not an error:
 * the user can add the RPC themselves, and the UI says so rather than blocking them.
 */
export async function trySwitchNetwork(w: Wallet): Promise<"switched" | "unsupported"> {
  const f = w.features as Record<string, unknown>;
  const ext = (f["nightly:changeNetwork"] ?? f["solana:changeNetwork"]) as
    | { changeNetwork(input: { chain: string; rpcUrl?: string }): Promise<void> }
    | undefined;
  if (!ext) return "unsupported";
  try {
    await ext.changeNetwork({
      chain: "solana:mainnet",
      rpcUrl: "https://rpc.cookiescan.io",
    });
    return "switched";
  } catch {
    return "unsupported";
  }
}

/** Sign a transaction the backend built. The wallet never sees the network — only bytes. */
export async function signTransactionBytes(
  w: Wallet,
  account: WalletAccount,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const feature = (w.features as Record<string, unknown>)[FEATURES.signTransaction] as
    | SignTxFeature
    | undefined;
  if (!feature) throw new Error(`${w.name} cannot sign transactions.`);

  const out = await feature.signTransaction({ account, transaction: bytes });
  const signed = out[0]?.signedTransaction;
  if (!signed) throw new Error(`${w.name} returned no signed transaction.`);
  return signed;
}

/** Sign a plain message — the launchpad login, which is not a transaction. */
export async function signMessageBytes(
  w: Wallet,
  account: WalletAccount,
  message: Uint8Array,
): Promise<Uint8Array> {
  const feature = (w.features as Record<string, unknown>)[FEATURES.signMessage] as
    | SignMessageFeature
    | undefined;
  if (!feature) throw new Error(`${w.name} cannot sign messages.`);

  const out = await feature.signMessage({ account, message });
  const sig = out[0]?.signature;
  if (!sig) throw new Error(`${w.name} returned no signature.`);
  return sig;
}

export function subscribe(
  w: Wallet,
  cb: (props: { accounts?: readonly WalletAccount[] }) => void,
): () => void {
  const feature = (w.features as Record<string, unknown>)[FEATURES.events] as
    | { on(e: string, cb: (p: unknown) => void): () => void }
    | undefined;
  if (!feature) return () => {};
  return feature.on("change", cb as (p: unknown) => void);
}
