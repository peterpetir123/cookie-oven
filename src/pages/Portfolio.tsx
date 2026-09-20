/**
 * Portfolio — what this wallet holds and what it can claim.
 *
 * The claim centre is the part that earns its place. Curve shares are not a token until a pool
 * graduates: they are a position account, and the refund or payout attached to them only moves if
 * someone sends the claim instruction. Nobody is notified when a pool they are in expires. So this
 * page scans every pool for this wallet and puts the claimable ones in front of the user, with the
 * action the backend recommends for each.
 */

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { useTransaction } from "../hooks/useTransaction.js";
import { Badge, Card, Empty, Loading, Notice, Stat } from "../components/ui.js";
import { Stages, TxFailure, TxSuccess } from "../components/Stages.js";
import { amount, progressTone, relativeTime, shortAddr } from "../lib/format.js";
import { useState } from "react";
import type { ConnectedWallet } from "../lib/wallet.js";
import type {
  LaunchpadPoolsResult,
  PositionsResult,
  PositionView,
  WalletBalances,
} from "../lib/types.js";

const POLL_MS = 15000;

export function PortfolioPage({ connection }: { connection: ConnectedWallet | null }) {
  const balances = usePoll(
    () =>
      connection
        ? read<WalletBalances>(TOOL.balances, {}, { wallet: connection.address })
        : Promise.resolve(null),
    POLL_MS,
    [connection?.address],
    !!connection,
  );
  const positions = usePoll(
    () =>
      connection
        ? read<PositionsResult>(TOOL.launchpadPositions, {}, { wallet: connection.address })
        : Promise.resolve(null),
    POLL_MS,
    [connection?.address],
    !!connection,
  );
  const pools = usePoll(
    () => read<LaunchpadPoolsResult>(TOOL.launchpadPools, { status: "all", limit: 50 }),
    POLL_MS,
  );

  if (!connection) {
    return (
      <Notice tone="info" hint="Balances and positions are read for a specific address.">
        Connect a wallet to see your portfolio.
      </Notice>
    );
  }

  const all = positions.data?.positions ?? [];
  const active = all.filter((p) => p.status === "live");
  const claimable = all.filter((p) => p.action && p.action.kind !== "sell");

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Card title="Wallet">
        <div className="grid cols-3">
          <Stat
            label="COOK"
            value={amount(balances.data?.cook.amount ?? 0)}
            sub={
              balances.data?.cook.usdValue ? `$${balances.data.cook.usdValue.toFixed(2)}` : undefined
            }
          />
          <Stat label="SPL tokens" value={balances.data?.tokens.length ?? 0} sub="held" />
          <Stat label="Open positions" value={active.length} sub={`${all.length} total`} />
        </div>
        <div className="row small faint" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <span className="mono">{shortAddr(connection.address, 8, 6)}</span>
          <a href={`https://cookiescan.io/address/${connection.address}`} target="_blank" rel="noreferrer">
            Cookiescan ↗
          </a>
        </div>
      </Card>

      {balances.data && balances.data.tokens.length > 0 ? (
        <Card title="Tokens" padded={false}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Mint</th>
                  <th className="right">Amount</th>
                  <th className="right">USD</th>
                </tr>
              </thead>
              <tbody>
                {balances.data.tokens.map((t) => (
                  <tr key={t.mint}>
                    <td className="strong">{t.symbol ?? "—"}</td>
                    <td className="small">
                      <a
                        href={`https://cookiescan.io/token/${t.mint}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono faint"
                      >
                        {shortAddr(t.mint)}
                      </a>
                    </td>
                    <td className="right">{amount(t.amount)}</td>
                    <td className="right dim">
                      {t.usdValue === null ? "—" : `$${t.usdValue.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {claimable.length > 0 ? (
        <Card title="Ready to claim">
          <div className="stack" style={{ gap: 10 }}>
            {claimable.map((p) => (
              <ClaimRow key={p.pool} position={p} connection={connection} onDone={positions.refresh} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Curve positions" padded={false}>
        {!positions.data ? (
          positions.error ? (
            <Notice tone="bad" hint={positions.error}>
              Could not scan positions.
            </Notice>
          ) : (
            <Loading label="Scanning pools for this wallet" />
          )
        ) : all.length === 0 ? (
          <Empty>
            No curve positions yet.
            {positions.data.note ? <div className="small faint" style={{ marginTop: 6 }}>{positions.data.note}</div> : null}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Launch</th>
                  <th>Status</th>
                  <th className="right">Shares</th>
                  <th className="right">Invested</th>
                  <th className="right">Est. value</th>
                  <th>Ends</th>
                </tr>
              </thead>
              <tbody>
                {all.map((p) => {
                  const pool = pools.data?.pools.find((x) => x.pool === p.pool);
                  return (
                    <tr key={p.pool}>
                      <td className="strong">{p.symbol}</td>
                      <td>
                        <Badge tone={p.status === "live" ? progressTone(pool?.graduationProgressPct ?? 0) : "low"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="right">{amount(p.shares)}</td>
                      <td className="right dim">{amount(p.investedCook)}</td>
                      <td className="right">{amount(p.estimatedValueCook)}</td>
                      <td className="small faint">
                        {pool ? relativeTime(pool.endsAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {positions.error && positions.data ? (
        <Notice tone="warn" hint={positions.error}>
          Showing the last good scan.
        </Notice>
      ) : null}
    </div>
  );
}

function ClaimRow({
  position,
  connection,
  onDone,
}: {
  position: PositionView;
  connection: ConnectedWallet;
  onDone: () => void;
}) {
  const tx = useTransaction();
  const [done, setDone] = useState(false);

  const claim = async () => {
    const outcome = await tx.run(
      TOOL.claimLaunchpad,
      { ref: position.pool, kind: "auto" },
      connection,
    );
    if (outcome) {
      setDone(true);
      onDone();
    }
  };

  return (
    <div className="card" style={{ background: "var(--bg-raised-2)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="strong">{position.symbol}</div>
          <div className="small faint">{position.action?.reason}</div>
        </div>
        {!done ? (
          <button className="primary" disabled={tx.running} onClick={() => void claim()}>
            {tx.running ? "Claiming…" : "Claim"}
          </button>
        ) : (
          <Badge tone="high">claimed</Badge>
        )}
      </div>

      {tx.stages.length > 0 && !done ? (
        <div style={{ marginTop: 10 }}>
          <Stages stages={tx.stages} />
        </div>
      ) : null}

      {tx.error ? (
        <div style={{ marginTop: 10 }}>
          <TxFailure message={tx.error.message} hint={tx.error.hint} onDismiss={tx.reset} onRetry={() => void claim()} />
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
