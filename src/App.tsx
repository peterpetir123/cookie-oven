/**
 * The shell: tabs, the wallet button, and the one piece of app-wide state that matters.
 *
 * Routing is a `useState` rather than a router. There are six screens, they share a wallet, and
 * none of them needs a URL that survives a reload — adding `react-router` for that would be a
 * dependency, a bundle, and a rewrite rule on the host, to solve a problem this app does not have.
 * `initialPool` is threaded through state instead, which is all the "deep link" that exists here
 * (Radar → Trade).
 */

import { useState } from "react";

import { WalletButton } from "./components/WalletButton.js";
import { useWallet } from "./hooks/useWallet.js";
import { PulsePage } from "./pages/Pulse.js";
import { RadarPage } from "./pages/Radar.js";
import { OvenPage } from "./pages/Oven.js";
import { TradePage } from "./pages/Trade.js";
import { PortfolioPage } from "./pages/Portfolio.js";
import { BridgePage } from "./pages/Bridge.js";
import type { LaunchpadPool } from "./lib/types.js";

type Tab = "radar" | "oven" | "trade" | "portfolio" | "bridge" | "pulse";

const TABS: { id: Tab; label: string }[] = [
  { id: "radar", label: "Radar" },
  { id: "oven", label: "Oven" },
  { id: "trade", label: "Trade" },
  { id: "portfolio", label: "Portfolio" },
  { id: "bridge", label: "Bridge" },
  { id: "pulse", label: "Pulse" },
];

export default function App() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("radar");
  const [pool, setPool] = useState<LaunchpadPool | null>(null);

  const goTrade = (p: LaunchpadPool) => {
    setPool(p);
    setTab("trade");
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden>
            🍪
          </span>
          <span className="name">Cookie Oven</span>
        </div>

        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="tab"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="spacer" />
        <WalletButton w={wallet} />
      </header>

      <main>
        {tab === "radar" ? <RadarPage onTrade={goTrade} /> : null}
        {tab === "oven" ? <OvenPage connection={wallet.connection} /> : null}
        {tab === "trade" ? <TradePage connection={wallet.connection} initialPool={pool} /> : null}
        {tab === "portfolio" ? <PortfolioPage connection={wallet.connection} /> : null}
        {tab === "bridge" ? <BridgePage connection={wallet.connection} /> : null}
        {tab === "pulse" ? <PulsePage /> : null}
      </main>

      <footer className="row small faint" style={{ marginTop: 40, justifyContent: "space-between" }}>
        <span>
          Built on Cookie Chain — an independent SVM network. RPC{" "}
          <span className="mono">rpc.cookiescan.io</span>
        </span>
        <a href="https://docs.cookiechain.wtf" target="_blank" rel="noreferrer">
          Docs ↗
        </a>
      </footer>
    </div>
  );
}
