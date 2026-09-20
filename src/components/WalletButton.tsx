/**
 * Wallet connect, disconnect, and the "wrong network" nudge.
 *
 * The nudge exists because Nightly is the only wallet that will move itself onto Cookie Chain, and
 * a user who skips it will otherwise sign a perfectly valid transaction that never confirms. The
 * message names the RPC so it can be added by hand.
 */

import { useState } from "react";

import { COOKIE_CHAIN_RPC } from "../lib/chain.js";
import { shortAddr } from "../lib/format.js";
import type { UseWallet } from "../hooks/useWallet.js";

export function WalletButton({ w }: { w: UseWallet }) {
  const [open, setOpen] = useState(false);

  if (w.address) {
    return (
      <div className="row">
        {w.network === "unsupported" ? (
          <span className="badge warn" title={`Add ${COOKIE_CHAIN_RPC} as a custom SVM RPC`}>
            <span className="dot" />
            check network
          </span>
        ) : null}
        <button className="wallet-chip" onClick={() => setOpen(true)} title={w.address}>
          <span className="dot" style={{ color: "var(--good)" }} />
          {shortAddr(w.address)}
        </button>
        <WalletModal open={open} onClose={() => setOpen(false)} w={w} />
      </div>
    );
  }

  return (
    <>
      <button className="primary" onClick={() => setOpen(true)} disabled={w.connecting}>
        {w.connecting ? "Connecting…" : "Connect Wallet"}
      </button>
      <WalletModal open={open} onClose={() => setOpen(false)} w={w} />
    </>
  );
}

function WalletModal({
  open,
  onClose,
  w,
}: {
  open: boolean;
  onClose: () => void;
  w: UseWallet;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <h3>{w.address ? "Wallet" : "Connect a wallet"}</h3>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {w.address ? (
          <div className="stack" style={{ gap: 12 }}>
            <div>
              <div className="stat-label">Address</div>
              <div className="mono small" style={{ wordBreak: "break-all" }}>
                {w.address}
              </div>
            </div>
            {w.network === "unsupported" ? (
              <div className="notice warn">
                <span className="icon">!</span>
                <div>
                  This wallet could not switch itself to Cookie Chain.
                  <div className="hint">
                    In your wallet's network settings, add a custom SVM network with RPC{" "}
                    <span className="mono">{COOKIE_CHAIN_RPC}</span>. Nightly does this automatically.
                  </div>
                  <button className="tiny" style={{ marginTop: 8 }} onClick={() => void w.switchNetwork()}>
                    Try again
                  </button>
                </div>
              </div>
            ) : w.network === "switched" ? (
              <div className="notice good">
                <span className="icon">✓</span>
                <div>Switched to Cookie Chain.</div>
              </div>
            ) : null}
            <button className="danger" onClick={() => void w.disconnect()}>
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            {w.error ? (
              <div className="notice bad" style={{ marginBottom: 12 }}>
                <span className="icon">✕</span>
                <div>{w.error}</div>
              </div>
            ) : null}

            {w.options.length === 0 ? (
              <div className="notice info">
                <span className="icon">i</span>
                <div>
                  No Solana-compatible wallet found.
                  <div className="hint">
                    Install <a href="https://nightly.app" target="_blank" rel="noreferrer">Nightly</a>{" "}
                    — it is the wallet Cookie Chain supports, and the only one that switches networks
                    for you. Then reload this page.
                  </div>
                </div>
              </div>
            ) : (
              w.options.map((o) => (
                <button
                  key={o.wallet.name}
                  className="wallet-option"
                  onClick={() => void w.connect(o.wallet)}
                  disabled={w.connecting}
                >
                  {o.icon ? <img src={o.icon} alt="" /> : <span style={{ width: 26 }}>🪙</span>}
                  <span style={{ flex: 1 }}>
                    <span className="strong">{o.name}</span>
                    {o.recommended ? (
                      <span className="faint small"> — recommended for Cookie Chain</span>
                    ) : null}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
