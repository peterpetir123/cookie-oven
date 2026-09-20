/**
 * Trade — buy and sell curve shares on a live launch.
 *
 * The order matters here and is deliberate:
 *
 *   1. quote      — what the curve says this order is worth, before anything is built
 *   2. guard      — the wallet's balance is checked against the quote client-side
 *   3. build/sign — only then does a wallet popup appear
 *
 * Checking the balance before the popup is the difference between "you don't have enough COOK"
 * shown instantly and the same thing shown after the user has already approved a signature they
 * did not need to give. A wallet prompt is a cost the user pays; this page does not spend it on an
 * order that cannot fill.
 */

import { useMemo, useState } from "react";

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { useTransaction } from "../hooks/useTransaction.js";
import { Badge, Card, Loading, Notice, Progress, Stat } from "../components/ui.js";
import { Stages, TxFailure, TxSuccess } from "../components/Stages.js";
import { amount, compact, pct, progressTone, relativeTime } from "../lib/format.js";
import type { ConnectedWallet } from "../lib/wallet.js";
import type {
  LaunchpadPool,
  LaunchpadPoolsResult,
  PositionsResult,
  WalletBalances,
} from "../lib/types.js";

const POLL_MS = 12000;

export function TradePage({
  connection,
  initialPool,
}: {
  connection: ConnectedWallet | null;
  initialPool: LaunchpadPool | null;
}) {
  const pools = usePoll(
    () => read<LaunchpadPoolsResult>(TOOL.launchpadPools, { status: "all", limit: 50 }),
    POLL_MS,
  );
  const [ref, setRef] = useState<string | null>(initialPool?.pool ?? null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amountIn, setAmountIn] = useState("");

  const all = useMemo(() => pools.data?.pools ?? [], [pools.data]);

  /**
   * The pool actually being shown.
   *
   * Derived rather than stored-and-corrected-in-an-effect, because the list refreshes underneath
   * the selection: a pool that graduated or expired drops out, and a stale `ref` would quote
   * against something that no longer exists. Deriving means there is no window where the two
   * disagree, and no cascading render to close it.
   */
  const effectiveRef = useMemo(() => {
    if (ref && all.some((p) => p.pool === ref)) return ref;
    if (initialPool && all.some((p) => p.pool === initialPool.pool)) return initialPool.pool;
    return all.find((p) => p.status === "live")?.pool ?? all[0]?.pool ?? null;
  }, [ref, all, initialPool]);

  const selected = all.find((p) => p.pool === effectiveRef) ?? null;

  if (!connection) {
    return (
      <Notice tone="info" hint="Buying and selling on the curve moves COOK, so it needs a wallet.">
        Connect a wallet to trade.
      </Notice>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid cols-2">
        <Card title="Order">
          <label className="field">
            <span>Launch</span>
            <select value={effectiveRef ?? ""} onChange={(e) => setRef(e.target.value)}>
              {all.length === 0 ? <option value="">No pools</option> : null}
              {all.map((p) => (
                <option key={p.pool} value={p.pool}>
                  {p.symbol} — {pct(p.graduationProgressPct)} {p.status !== "live" ? `(${p.status})` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="row" style={{ marginBottom: 12 }}>
            <button
              className={side === "buy" ? "primary" : ""}
              style={{ flex: 1 }}
              onClick={() => {
                setSide("buy");
                setAmountIn("");
              }}
            >
              Buy
            </button>
            <button
              className={side === "sell" ? "primary" : ""}
              style={{ flex: 1 }}
              onClick={() => {
                setSide("sell");
                setAmountIn("");
              }}
            >
              Sell
            </button>
          </div>

          {selected ? (
            side === "buy" ? (
              <BuyForm
                pool={selected}
                connection={connection}
                amountIn={amountIn}
                setAmountIn={setAmountIn}
              />
            ) : (
              <SellForm
                pool={selected}
                connection={connection}
                amountIn={amountIn}
                setAmountIn={setAmountIn}
              />
            )
          ) : (
            <Loading label="Waiting for the pool list" />
          )}
        </Card>

        <div className="stack" style={{ gap: 12 }}>
          {selected ? <PoolFacts pool={selected} /> : null}
          {connection ? <BalancesCard connection={connection} /> : null}
          {connection && selected ? (
            <PositionsCard connection={connection} pool={selected} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ buy */

function BuyForm({
  pool,
  connection,
  amountIn,
  setAmountIn,
}: {
  pool: LaunchpadPool;
  connection: ConnectedWallet;
  amountIn: string;
  setAmountIn: (v: string) => void;
}) {
  const tx = useTransaction();
  const balances = usePoll(
    () => read<WalletBalances>(TOOL.balances, {}, { wallet: connection.address }),
    POLL_MS,
    [connection.address],
  );

  const cookBalance = Number(balances.data?.cook.amount ?? 0);
  const spend = Number(amountIn || 0);
  const overspend = spend > 0 && spend > cookBalance;
  const notLive = pool.status !== "live";

  const submit = async () => {
    if (!amountIn || spend <= 0) return;
    const outcome = await tx.run(TOOL.launchpadBuy, { ref: pool.pool, amountCook: amountIn }, connection);
    if (outcome) {
      setAmountIn("");
      balances.refresh();
    }
  };

  return (
    <div>
      <label className="field">
        <span>Spend (COOK)</span>
        <input
          value={amountIn}
          onChange={(e) => setAmountIn(sanitizeNumber(e.target.value))}
          placeholder="0.0"
          inputMode="decimal"
          disabled={tx.running || notLive}
        />
        <small>
          Balance {amount(balances.data?.cook.amount ?? 0)} COOK
          {balances.data?.cook.usdValue ? ` · ${(balances.data.cook.usdValue).toFixed(2)} USD` : ""}
        </small>
      </label>

      {overspend ? (
        <Notice tone="warn" hint="Top up through the bridge, or lower the amount.">
          That is more COOK than this wallet holds.
        </Notice>
      ) : null}

      {notLive ? (
        <Notice tone="info" hint="Only live curves can be bought from.">
          This launch is {pool.status}.
        </Notice>
      ) : null}

      {tx.stages.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <Stages stages={tx.stages} />
        </div>
      ) : null}

      {tx.error ? (
        <div style={{ marginTop: 12 }}>
          <TxFailure message={tx.error.message} hint={tx.error.hint} onDismiss={tx.reset} onRetry={submit} />
        </div>
      ) : null}

      {tx.result ? (
        <div style={{ marginTop: 12 }}>
          <TxSuccess outcome={tx.result} onDismiss={tx.reset} />
        </div>
      ) : null}

      <button
        className="primary"
        style={{ width: "100%", marginTop: 12 }}
        disabled={tx.running || !amountIn || spend <= 0 || overspend || notLive}
        onClick={() => void submit()}
      >
        {tx.running ? "Working…" : `Buy ${pool.symbol}`}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- sell */

function SellForm({
  pool,
  connection,
  amountIn,
  setAmountIn,
}: {
  pool: LaunchpadPool;
  connection: ConnectedWallet;
  amountIn: string;
  setAmountIn: (v: string) => void;
}) {
  const tx = useTransaction();
  const positions = usePoll(
    () =>
      read<PositionsResult>(TOOL.launchpadPositions, {}, { wallet: connection.address }),
    POLL_MS,
    [connection.address],
  );

  const mine = positions.data?.positions.find((p) => p.pool === pool.pool);
  const held = Number(mine?.shares ?? 0);
  const selling = Number(amountIn || 0);
  const oversell = selling > 0 && selling > held;

  const submit = async () => {
    if (!amountIn || selling <= 0) return;
    const outcome = await tx.run(
      TOOL.launchpadSell,
      { ref: pool.pool, shares: amountIn },
      connection,
    );
    if (outcome) {
      setAmountIn("");
      positions.refresh();
    }
  };

  return (
    <div>
      <label className="field">
        <span>Sell (curve shares)</span>
        <input
          value={amountIn}
          onChange={(e) => setAmountIn(sanitizeNumber(e.target.value))}
          placeholder="0.0"
          inputMode="decimal"
          disabled={tx.running}
        />
        <small>
          You hold {amount(mine?.shares ?? 0)} shares
          {mine?.estimatedValueCook ? ` · ~${amount(mine.estimatedValueCook)} COOK` : ""}
        </small>
      </label>

      <div className="row" style={{ marginBottom: 10 }}>
        <button className="tiny" onClick={() => setAmountIn(String(held))} disabled={held <= 0}>
          Max
        </button>
        {mine?.action ? <span className="tiny faint">{mine.action.reason}</span> : null}
      </div>

      {oversell ? (
        <Notice tone="warn">That is more shares than this wallet holds.</Notice>
      ) : null}

      {tx.stages.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <Stages stages={tx.stages} />
        </div>
      ) : null}

      {tx.error ? (
        <div style={{ marginTop: 12 }}>
          <TxFailure message={tx.error.message} hint={tx.error.hint} onDismiss={tx.reset} onRetry={submit} />
        </div>
      ) : null}

      {tx.result ? (
        <div style={{ marginTop: 12 }}>
          <TxSuccess outcome={tx.result} onDismiss={tx.reset} />
        </div>
      ) : null}

      <button
        className="primary"
        style={{ width: "100%", marginTop: 12 }}
        disabled={tx.running || !amountIn || selling <= 0 || oversell}
        onClick={() => void submit()}
      >
        {tx.running ? "Working…" : `Sell ${pool.symbol}`}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- panels */

function PoolFacts({ pool }: { pool: LaunchpadPool }) {
  const tone = progressTone(pool.graduationProgressPct);
  return (
    <Card
      title={pool.name}
      right={<Badge tone={pool.status === "live" ? tone : "low"}>{pool.status}</Badge>}
    >
      <div className="grid cols-2">
        <Stat label="Price" value={amount(pool.priceCook, 6)} small sub="COOK per token" />
        <Stat label="Raised" value={compact(Number(pool.raisedCook))} small sub="COOK" />
        <Stat label="Holders" value={pool.participants} small />
        <Stat label="Ends" value={relativeTime(pool.endsAt)} small />
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <span className="small dim">To graduation</span>
          <span className="small mono">{pct(pool.graduationProgressPct)}</span>
        </div>
        <Progress pct={pool.graduationProgressPct} tone={tone} />
      </div>
      <div className="small faint" style={{ marginTop: 12 }}>
        {pool.expiryMode === "fair"
          ? "Fair mode: if this pool expires without graduating, holders are refunded pro-rata."
          : "Jackpot mode: settlement pays out through a Merkle root."}
      </div>
    </Card>
  );
}

function BalancesCard({ connection }: { connection: ConnectedWallet }) {
  const balances = usePoll(
    () => read<WalletBalances>(TOOL.balances, {}, { wallet: connection.address }),
    POLL_MS,
    [connection.address],
  );
  const tokens = balances.data?.tokens ?? [];

  return (
    <Card title="Your wallet">
      {!balances.data ? (
        balances.error ? (
          <Notice tone="bad" hint={balances.error}>
            Could not read balances.
          </Notice>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <Stat
            label="COOK"
            value={amount(balances.data.cook.amount)}
            small
            sub={balances.data.cook.usdValue ? `$${balances.data.cook.usdValue.toFixed(2)}` : undefined}
          />
          {tokens.length > 0 ? (
            <div className="stack small" style={{ marginTop: 12 }}>
              {tokens.slice(0, 5).map((t) => (
                <div key={t.mint} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="dim">{t.symbol ?? `${t.mint.slice(0, 6)}…`}</span>
                  <span className="mono">{amount(t.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="small faint" style={{ marginTop: 8 }}>
              No SPL tokens yet.
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function PositionsCard({
  connection,
  pool,
}: {
  connection: ConnectedWallet;
  pool: LaunchpadPool;
}) {
  const positions = usePoll(
    () => read<PositionsResult>(TOOL.launchpadPositions, {}, { wallet: connection.address }),
    POLL_MS,
    [connection.address],
  );
  const mine = positions.data?.positions.find((p) => p.pool === pool.pool);

  if (!positions.data) return null;
  if (!mine) {
    return (
      <Card title="Your position">
        <div className="small faint">No position in {pool.symbol}.</div>
      </Card>
    );
  }

  return (
    <Card title="Your position">
      <div className="grid cols-2">
        <Stat label="Shares" value={amount(mine.shares)} small />
        <Stat label="Est. value" value={amount(mine.estimatedValueCook)} small sub="COOK" />
        <Stat label="Invested" value={amount(mine.investedCook)} small />
        <Stat label="Withdrawn" value={amount(mine.withdrawnCook)} small />
      </div>
      {mine.action ? (
        <div className="small faint" style={{ marginTop: 10 }}>
          {mine.action.reason}
        </div>
      ) : null}
    </Card>
  );
}

/** Digits and one decimal point. Keeps a paste or a stray keystroke from producing NaN. */
function sanitizeNumber(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
}
