/**
 * Wallet state for the app.
 *
 * Handles the three things that make a wallet connection feel broken when they are missed:
 * silent reconnect on reload, reacting to the wallet disconnecting from its own UI, and switching
 * to Cookie Chain when the wallet can do that.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Wallet } from "@wallet-standard/base";

import {
  connect as connectWallet,
  discoverWallets,
  disconnect as disconnectWallet,
  onWalletsChanged,
  subscribe,
  trySwitchNetwork,
  type ConnectedWallet,
  type WalletOption,
} from "../lib/wallet.js";

const REMEMBER_KEY = "cookie-oven:wallet";

export type NetworkStatus = "unknown" | "switched" | "unsupported";

export interface UseWallet {
  options: WalletOption[];
  connection: ConnectedWallet | null;
  address: string | null;
  connecting: boolean;
  error: string | null;
  network: NetworkStatus;
  connect: (w: Wallet) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Re-run the network switch, for the banner's "try again". */
  switchNetwork: () => Promise<void>;
}

export function useWallet(): UseWallet {
  const [options, setOptions] = useState<WalletOption[]>(() => safeDiscover());
  const [connection, setConnection] = useState<ConnectedWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkStatus>("unknown");
  const attempted = useRef(false);

  // Wallets register asynchronously — an extension injects after first paint — so a one-shot scan
  // at mount finds nothing and the connect button appears broken.
  useEffect(() => {
    const refresh = () => setOptions(safeDiscover());
    refresh();
    return onWalletsChanged(refresh);
  }, []);

  const finishConnect = useCallback(async (w: Wallet, silent: boolean) => {
    const c = await connectWallet(w, silent);
    setConnection(c);
    setError(null);
    localStorage.setItem(REMEMBER_KEY, w.name);

    const net = await trySwitchNetwork(w);
    setNetwork(net);

    // The wallet can disconnect or switch accounts from its own popup; without this the app keeps
    // showing an address the wallet is no longer acting as.
    subscribe(w, (props) => {
      const accounts = props.accounts;
      if (!accounts || accounts.length === 0) {
        setConnection(null);
        localStorage.removeItem(REMEMBER_KEY);
        return;
      }
      const stillThere = accounts.find((a) => a.address === c.address);
      if (!stillThere) {
        setConnection({ wallet: w, account: accounts[0], address: accounts[0].address });
      }
    });
  }, []);

  // Silent reconnect once, after wallets have had a chance to register.
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    const remembered = localStorage.getItem(REMEMBER_KEY);
    if (!remembered) return;

    let cancelled = false;
    const tryIt = async () => {
      const found = safeDiscover().find((o) => o.name === remembered);
      if (!found || cancelled) return;
      try {
        await finishConnect(found.wallet, true);
      } catch {
        // Silent reconnect failing is normal — the user may have revoked access. Say nothing;
        // they can click connect.
        localStorage.removeItem(REMEMBER_KEY);
      }
    };
    const t = setTimeout(tryIt, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [finishConnect]);

  const connect = useCallback(
    async (w: Wallet) => {
      setConnecting(true);
      setError(null);
      try {
        await finishConnect(w, false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setConnecting(false);
      }
    },
    [finishConnect],
  );

  const disconnect = useCallback(async () => {
    if (!connection) return;
    try {
      await disconnectWallet(connection.wallet);
    } catch {
      // Some wallets throw on disconnect when already disconnected. The intent is satisfied either
      // way, so this is not worth surfacing.
    }
    setConnection(null);
    setNetwork("unknown");
    localStorage.removeItem(REMEMBER_KEY);
  }, [connection]);

  const switchNetwork = useCallback(async () => {
    if (!connection) return;
    setNetwork(await trySwitchNetwork(connection.wallet));
  }, [connection]);

  return useMemo(
    () => ({
      options,
      connection,
      address: connection?.address ?? null,
      connecting,
      error,
      network,
      connect,
      disconnect,
      switchNetwork,
    }),
    [options, connection, connecting, error, network, connect, disconnect, switchNetwork],
  );
}

/** `getWallets()` throws in exotic environments (no window, sandboxed iframe). Never fatal. */
function safeDiscover(): WalletOption[] {
  try {
    return discoverWallets();
  } catch {
    return [];
  }
}
