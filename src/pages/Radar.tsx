/**
 * Radar — every live launch on the MomoSwap curve.
 *
 * This is the app's front door, and the reason it exists: the curve is where Cookie Chain's
 * activity actually is, and the launchpad's own UI shows one pool at a time. Here every open pool
 * is on one screen with the number that decides whether it is worth looking at — how far along the
 * curve it is, because that is what determines whether the sell side still works.
 *
 * Progress is not decoration. A curve near graduation behaves differently from one that is not:
 * buying late means buying high, and the refund path only exists for pools that expire without
 * graduating.
 */

import { useMemo, useState } from "react";

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { Badge, Card, Empty, Loading, Notice, Progress } from "../components/ui.js";
import { amount, compact, pct, progressTone, relativeTime, shortAddr } from "../lib/format.js";
import type { LaunchpadPool, LaunchpadPoolsResult } from "../lib/types.js";

const POLL_MS = 15000;

type Filter = "live" | "ended" | "all";

export function RadarPage({ onTrade }: { onTrade: (pool: LaunchpadPool) => void }) {
  const [filter, setFilter] = useState<Filter>("live");
  const pools = usePoll(
    () => read<LaunchpadPoolsResult>(TOOL.launchpadPools, { status: "all", limit: 50 }),
    POLL_MS,
    [filter],
  );

  const shown = useMemo(() => {
    const all = pools.data?.pools ?? [];
    if (filter === "all") return all;
    return all.filter((p) => (filter === "live" ? p.status === "live" : p.status !== "live"));
  }, [pools.data, filter]);

  const liveCount = (pools.data?.pools ?? []).filter((p) => p.status === "live").length;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Card
        title="Launchpad radar"
        right={
          <div className="row">
            <span className="small faint">
              {liveCount} live
              {pools.updatedAt ? ` · ${relativeTime(pools.updatedAt)}` : ""}
            </span>
            <div className="row" style={{ gap: 2 }}>
              {(["live", "ended", "all"] as Filter[]).map((f) => (
                <button
                  key={f}
                  className={filter === f ? "" : "ghost"}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        }
        padded={false}
      >
        {!pools.data ? (
          pools.error ? (
            <Notice tone="bad" hint={pools.error}>
              Could not reach the launchpad.
            </Notice>
          ) : (
            <Loading label="Scanning the curve" />
          )
        ) : shown.length === 0 ? (
          <Empty>
            No {filter === "all" ? "" : filter} pools right now.
            {filter === "live" ? " Open the Oven to start one." : ""}
          </Empty>
        ) : (
          <div style={{ padding: 16 }}>
            <div className="grid cols-2">
              {shown.map((p) => (
                <PoolCard key={p.pool} pool={p} onTrade={() => onTrade(p)} />
              ))}
            </div>
          </div>
        )}
      </Card>

      {pools.error && pools.data ? (
        <Notice tone="warn" hint={pools.error}>
          Showing the last good scan — the launchpad API is not answering right now.
        </Notice>
      ) : null}
    </div>
  );
}

function PoolCard({ pool, onTrade }: { pool: LaunchpadPool; onTrade: () => void }) {
  const tone = progressTone(pool.graduationProgressPct);
  const ended = pool.status !== "live";

  return (
    <div
      className="card"
      style={{ padding: 14, opacity: ended ? 0.65 : 1, cursor: ended ? "default" : "pointer" }}
      onClick={ended ? undefined : onTrade}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="strong" style={{ fontSize: 15 }}>
            {pool.name}
          </div>
          <div className="small faint mono">{pool.symbol}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {pool.expiryMode === "fair" ? <Badge tone="info">fair</Badge> : null}
          {pool.antiSnipe ? <Badge tone="low">anti-snipe</Badge> : null}
          <Badge tone={ended ? "low" : tone}>{pool.status}</Badge>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <span className="small dim">Graduation</span>
          <span className="small mono strong">{pct(pool.graduationProgressPct)}</span>
        </div>
        <Progress pct={pool.graduationProgressPct} tone={tone} />
      </div>

      <div className="grid cols-3" style={{ marginTop: 12, gap: 8 }}>
        <div>
          <div className="stat-label">Raised</div>
          <div className="mono small">{compact(Number(pool.raisedCook))}</div>
        </div>
        <div>
          <div className="stat-label">Target</div>
          <div className="mono small">{compact(Number(pool.graduationTargetCook))}</div>
        </div>
        <div>
          <div className="stat-label">Price</div>
          <div className="mono small">{amount(pool.priceCook, 6)}</div>
        </div>
      </div>

      <div className="row small faint" style={{ marginTop: 12, justifyContent: "space-between" }}>
        <span>{pool.participants} holders</span>
        <span>{ended ? "ended" : `ends ${relativeTime(pool.endsAt)}`}</span>
      </div>

      <div className="row small" style={{ marginTop: 10, justifyContent: "space-between" }}>
        <a
          href={`https://cookiescan.io/token/${pool.mint}`}
          target="_blank"
          rel="noreferrer"
          className="mono faint"
          onClick={(e) => e.stopPropagation()}
        >
          {shortAddr(pool.mint)}
        </a>
        {!ended ? (
          <button
            className="tiny"
            onClick={(e) => {
              e.stopPropagation();
              onTrade();
            }}
          >
            Trade →
          </button>
        ) : null}
      </div>
    </div>
  );
}
