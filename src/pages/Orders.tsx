/**
 * Orders — limit and stop orders on the Cookiebox order program.
 *
 * This page exists because of one refusal. `place_limit_order` will not build an
 * order that would fill immediately at a worse rate than a plain swap, which is
 * correct and unhelpful at the same time: the error says the limit has to sit
 * above the current rate, but a user who cannot see the current rate has no way
 * to act on that.
 *
 * So the rate is fetched first and shown beside the input. The rule the program
 * enforces is stated on the page in the same words the error uses, and the
 * form's own validation applies it before a wallet prompt is ever opened.
 */

import { useMemo, useState } from "react";

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { useTransaction } from "../hooks/useTransaction.js";
import { Badge, Card, Empty, Loading, Notice, Stat } from "../components/ui.js";
import { Stages, TxFailure, TxSuccess } from "../components/Stages.js";
import { amount, relativeTime, shortAddr } from "../lib/format.js";
import { BCOOK_MINT, COOK_MINT, COOK_SYMBOL } from "../lib/chain.js";
import type { ConnectedWallet } from "../lib/wallet.js";
import type { LimitOrdersResult, LimitOrderView, QuoteResult } from "../lib/types.js";

const POLL_MS = 20000;

/** Assets worth quoting against each other on this chain. */
const ASSETS = [
  { mint: COOK_MINT, symbol: COOK_SYMBOL },
  { mint: BCOOK_MINT, symbol: "bCOOK" },
];

export function OrdersPage({ connection }: { connection: ConnectedWallet | null }) {
  const [inputMint, setInputMint] = useState(COOK_MINT);
  const [outputMint, setOutputMint] = useState(BCOOK_MINT);
  const [amountIn, setAmountIn] = useState("1");
  const [rate, setRate] = useState("");
  const [expiresDays, setExpiresDays] = useState("7");
  const tx = useTransaction();

  const orders = usePoll(
    () =>
      connection
        ? read<LimitOrdersResult>(TOOL.limitOrders, {}, { wallet: connection.address })
        : Promise.resolve(null),
    POLL_MS,
    [connection?.address],
    !!connection,
  );

  // What the market pays right now, for this size. The limit has to beat it.
  const quote = usePoll(
    () =>
      Number(amountIn) > 0 && inputMint !== outputMint
        ? read<QuoteResult>(TOOL.quote, { inputMint, outputMint, amount: amountIn })
        : Promise.resolve(null),
    POLL_MS,
    [inputMint, outputMint, amountIn],
    Number(amountIn) > 0 && inputMint !== outputMint,
  );

  /**
   * The market rate, output per input, in human units.
   *
   * `expectedOut` is already the human-readable amount, so this is a plain
   * division. It is the number the program compares a limit against.
   */
  const marketRate = useMemo(() => {
    const q = quote.data;
    const out = Number(q?.output?.expectedOut ?? 0);
    const inp = Number(amountIn);
    if (!q || !inp || !out) return null;
    return out / inp;
  }, [quote.data, amountIn]);

  const limitRate = Number(rate);
  // The program's rule, applied here so the user is told before the wallet opens.
  const wouldFillNow = marketRate !== null && limitRate > 0 && limitRate <= marketRate;

  const inSymbol = ASSETS.find((a) => a.mint === inputMint)?.symbol ?? "?";
  const outSymbol = ASSETS.find((a) => a.mint === outputMint)?.symbol ?? "?";

  const submit = async () => {
    if (!connection || !rate) return;
    const outcome = await tx.run(
      TOOL.placeLimitOrder,
      {
        inputMint,
        outputMint,
        amount: amountIn,
        price: rate,
        kind: "limit",
        expiresInSeconds: Math.round(Number(expiresDays) * 86_400),
      },
      connection,
    );
    if (outcome) orders.refresh();
  };

  if (!connection) {
    return (
      <Notice tone="info" hint="An order escrows your input until it fills or you cancel it.">
        Connect a wallet to place and manage orders.
      </Notice>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid cols-2">
        <Card title="Place a limit order">
          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">
              <span>You give</span>
              <select
                value={inputMint}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputMint(v);
                  if (v === outputMint) setOutputMint(v === COOK_MINT ? BCOOK_MINT : COOK_MINT);
                  setRate("");
                }}
                disabled={tx.running}
              >
                {ASSETS.map((a) => (
                  <option key={a.mint} value={a.mint}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>You receive</span>
              <select value={outputMint} onChange={(e) => setOutputMint(e.target.value)} disabled={tx.running}>
                {ASSETS.filter((a) => a.mint !== inputMint).map((a) => (
                  <option key={a.mint} value={a.mint}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Amount of {inSymbol}</span>
            <input
              value={amountIn}
              onChange={(e) => setAmountIn(digits(e.target.value))}
              inputMode="decimal"
              disabled={tx.running}
            />
          </label>

          <label className="field">
            <span>Your rate ({outSymbol} per {inSymbol})</span>
            <input
              value={rate}
              onChange={(e) => setRate(digits(e.target.value))}
              placeholder={marketRate ? marketRate.toFixed(8) : "0.0"}
              inputMode="decimal"
              disabled={tx.running}
            />
            <small>
              {quote.loading && !marketRate
                ? "Reading the market rate…"
                : marketRate !== null
                  ? `The market pays ${amount(marketRate, 8)} ${outSymbol} per ${inSymbol} right now.`
                  : "Enter an amount to see the market rate."}
            </small>
          </label>

          <label className="field">
            <span>Expires in (days)</span>
            <input
              value={expiresDays}
              onChange={(e) => setExpiresDays(digits(e.target.value))}
              inputMode="decimal"
              disabled={tx.running}
            />
          </label>

          {marketRate !== null ? (
            <div className="row" style={{ gap: 6, marginBottom: 12 }}>
              <button
                className="tiny"
                onClick={() => setRate((marketRate * 1.05).toFixed(8))}
                disabled={tx.running}
              >
                +5%
              </button>
              <button
                className="tiny"
                onClick={() => setRate((marketRate * 1.25).toFixed(8))}
                disabled={tx.running}
              >
                +25%
              </button>
              <button
                className="tiny"
                onClick={() => setRate((marketRate * 2).toFixed(8))}
                disabled={tx.running}
              >
                2x
              </button>
            </div>
          ) : null}

          {wouldFillNow ? (
            <Notice
              tone="warn"
              hint="A limit is for getting a better rate than the market. If you want the market rate, swap instead."
            >
              This would fill immediately, at a worse rate than a plain swap.
            </Notice>
          ) : null}

          {tx.stages.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <Stages stages={tx.stages} />
            </div>
          ) : null}

          {tx.error ? (
            <div style={{ marginTop: 12 }}>
              <TxFailure
                message={tx.error.message}
                hint={tx.error.hint}
                onDismiss={tx.reset}
                onRetry={() => void submit()}
              />
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
            disabled={tx.running || !rate || Number(rate) <= 0 || wouldFillNow || Number(amountIn) <= 0}
            onClick={() => void submit()}
          >
            {tx.running ? "Working…" : "Place order"}
          </button>

          <div className="small faint" style={{ marginTop: 10 }}>
            Your {inSymbol} is escrowed until the order fills or you cancel it. A limit has to sit
            above the market rate; a stop sits below it and triggers on the way down.
          </div>
        </Card>

        <div className="stack" style={{ gap: 12 }}>
          <Card title="How an order differs from a swap">
            <div className="small dim" style={{ lineHeight: 1.7 }}>
              A swap takes whatever the market pays at that instant. An order waits, and only fills
              at the rate you name or better. The trade is that your input is locked up while it
              waits, and nothing happens at all if the market never reaches your price.
            </div>
            {orders.data?.fees ? (
              <div className="grid cols-2" style={{ marginTop: 14 }}>
                <Stat label="Maker fee" value={`${orders.data.fees.makerFeeBps / 100}%`} small />
                <Stat label="Taker fee" value={`${orders.data.fees.takerFeeBps / 100}%`} small />
              </div>
            ) : null}
          </Card>

          {orders.data?.ownerName ? (
            <Card title="Your .cook name">
              <Stat label="Resolves to this wallet" value={orders.data.ownerName} small />
            </Card>
          ) : null}
        </div>
      </div>

      <Card
        title="Your orders"
        right={
          orders.data ? <span className="small faint">{orders.data.count} open</span> : null
        }
        padded={false}
      >
        {!orders.data ? (
          orders.error ? (
            <Notice tone="bad" hint={orders.error}>
              Could not read orders.
            </Notice>
          ) : (
            <Loading />
          )
        ) : orders.data.orders.length === 0 ? (
          <Empty>No open orders. Place one above, and it waits for your rate.</Empty>
        ) : (
          <div style={{ padding: 16 }}>
            <div className="stack" style={{ gap: 10 }}>
              {orders.data.orders.map((o) => (
                <OrderRow key={o.order} order={o} connection={connection} onDone={orders.refresh} />
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function OrderRow({
  order,
  connection,
  onDone,
}: {
  order: LimitOrderView;
  connection: ConnectedWallet;
  onDone: () => void;
}) {
  const tx = useTransaction();
  const [done, setDone] = useState(false);

  const cancel = async () => {
    const outcome = await tx.run(TOOL.cancelLimitOrder, { order: order.order }, connection);
    if (outcome) {
      setDone(true);
      onDone();
    }
  };

  const expired = order.status === "expired";

  return (
    <div className="card" style={{ background: "var(--bg-raised-2)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="strong">
              {order.input.symbol ?? "?"} → {order.output.symbol ?? "?"}
            </span>
            <Badge tone={expired ? "bad" : order.status === "filling" ? "mid" : "info"}>
              {order.status}
            </Badge>
          </div>
          <div className="small faint" style={{ marginTop: 4 }}>
            {amount(order.input.remaining)} of {amount(order.input.original)} {order.input.symbol} left
            {order.price !== null ? ` · rate ${amount(order.price, 8)}` : ""}
          </div>
          <div className="tiny faint mono" style={{ marginTop: 2 }}>
            {shortAddr(order.order)}
          </div>
        </div>

        {!done ? (
          <button
            className={expired ? "primary" : "danger"}
            disabled={tx.running}
            onClick={() => void cancel()}
          >
            {tx.running ? "…" : expired ? "Reclaim" : "Cancel"}
          </button>
        ) : (
          <Badge tone="high">done</Badge>
        )}
      </div>

      {expired ? (
        <div className="small faint" style={{ marginTop: 8 }}>
          The order expired. Your input is still escrowed until you reclaim it.
        </div>
      ) : order.expiresAt ? (
        <div className="small faint" style={{ marginTop: 8 }}>
          Expires {relativeTime(order.expiresAt)}
        </div>
      ) : null}

      {tx.error ? (
        <div style={{ marginTop: 10 }}>
          <TxFailure message={tx.error.message} hint={tx.error.hint} onDismiss={tx.reset} onRetry={() => void cancel()} />
        </div>
      ) : null}

      {tx.result ? (
        <div style={{ marginTop: 10 }}>
          <TxSuccess outcome={tx.result} onDismiss={tx.reset} />
        </div>
      ) : null}
    </div>
  );
}

/** Digits and one decimal point. A stray paste must not become NaN. */
function digits(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
}
