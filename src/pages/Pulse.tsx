/**
 * Pulse — what the chain is doing right now.
 *
 * Every number here comes from a live call: `getChainHealth` for the chain, `getPools` for
 * liquidity, `getStakeInfo` for the stake pool, `getMarketStats` for Baked Bazaar. Nothing is
 * hardcoded and nothing is a placeholder, which is the point — the bounty's own "Live Data Policy"
 * says metrics have to be sourced on-chain, and a dashboard that fakes them is worse than one that
 * omits them.
 */

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { Card, Loading, Notice, Progress, Stat, Badge } from "../components/ui.js";
import { compact, pct, relativeTime, shortAddr, usd } from "../lib/format.js";
import type {
  ChainHealth,
  MarketStats,
  PoolsResult,
  StakeInfo,
} from "../lib/types.js";

const HEALTH_MS = 5000;
const SLOW_MS = 30000;

export function PulsePage() {
  const health = usePoll(() => read<ChainHealth>(TOOL.chainHealth), HEALTH_MS);
  const pools = usePoll(() => read<PoolsResult>(TOOL.pools, { limit: 8 }), SLOW_MS);
  const stake = usePoll(() => read<StakeInfo>(TOOL.stakeInfo), SLOW_MS);
  const market = usePoll(() => read<MarketStats>(TOOL.marketStats), SLOW_MS);

  const h = health.data;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Card
        title="Chain"
        right={
          h ? (
            <Badge tone={h.healthy ? "high" : "bad"}>
              <span className={`dot${h.healthy ? " pulse" : ""}`} />
              {h.status}
            </Badge>
          ) : null
        }
      >
        {!h ? (
          health.error ? (
            <Notice tone="bad" hint={health.error}>
              Could not read chain health.
            </Notice>
          ) : (
            <Loading label="Reading Cookie Chain" />
          )
        ) : (
          <>
            <div className="grid cols-4">
              <Stat
                label="Slot"
                value={compact(h.absoluteSlot)}
                sub={`block height ${compact(h.blockHeight)}`}
              />
              <Stat
                label="Slots / sec"
                value={h.slotsPerSec.toFixed(2)}
                sub={`${h.version}`}
              />
              <Stat
                label="Finality lag"
                value={`${h.finalizationLag} slots`}
                tone={h.finalizationStalled ? "bad" : "good"}
                sub={h.finalizationStalled ? "finalization stalled" : "healthy"}
              />
              <Stat
                label="Validators"
                value={`${h.validatorCount}`}
                tone={h.delinquentCount > 0 ? "warn" : "good"}
                sub={
                  h.delinquentCount > 0
                    ? `${h.delinquentCount} delinquent`
                    : `${h.clusterNodeCount} nodes`
                }
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="stat-label">Epoch {h.epoch}</span>
                <span className="small faint">{pct(h.epochProgressPct)}</span>
              </div>
              <Progress
                pct={h.epochProgressPct}
                tone={h.epochProgressPct > 66 ? "high" : h.epochProgressPct > 33 ? "mid" : "low"}
              />
            </div>

            <div className="row small faint" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <span className="mono">{h.rpc.endpoint}</span>
              <span>
                RPC {h.rpc.latencyMs}ms
                {health.updatedAt ? ` · updated ${relativeTime(health.updatedAt)}` : ""}
              </span>
            </div>
          </>
        )}
      </Card>

      <div className="grid cols-2">
        <Card title="Stake pool">
          {!stake.data ? (
            stake.error ? (
              <Notice tone="bad" hint={stake.error}>
                Could not read the stake pool.
              </Notice>
            ) : (
              <Loading />
            )
          ) : (
            <>
              <div className="grid cols-2">
                <Stat label="APY" value={pct(stake.data.apyPct, 2)} tone="good" small />
                <Stat
                  label="TVL"
                  value={`${compact(Number(stake.data.tvlCook))} COOK`}
                  small
                />
                <Stat
                  label="1 bCOOK"
                  value={`${Number(stake.data.rate).toFixed(4)} COOK`}
                  small
                />
                <Stat
                  label="bCOOK supply"
                  value={compact(Number(stake.data.bcookSupply))}
                  small
                />
              </div>
              <div className="small faint" style={{ marginTop: 12 }}>
                Deposit {stake.data.fees.depositPct}% · withdraw {stake.data.fees.withdrawPct}%.
                Bake your COOK, stay liquid, keep earning.
              </div>
              {stake.data.links?.pool ? (
                <div style={{ marginTop: 10 }}>
                  <a
                    className="small"
                    href={stake.data.links.pool}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Stake pool on Cookiescan ↗
                  </a>
                </div>
              ) : null}
            </>
          )}
        </Card>

        <Card title={`Baked Bazaar — ${market.data?.marketplace ?? "NFT market"}`}>
          {!market.data ? (
            market.error ? (
              <Notice tone="bad" hint={market.error}>
                Could not read market stats.
              </Notice>
            ) : (
              <Loading />
            )
          ) : (
            <div className="grid cols-2">
              <Stat label="Listings" value={market.data.listingsCount} small />
              <Stat label="Floor" value={`${compact(Number(market.data.floorPrice))} COOK`} small />
              <Stat label="Sales" value={market.data.salesCount} small />
              <Stat
                label="Volume"
                value={`${compact(Number(market.data.totalVolume))} COOK`}
                small
              />
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Deepest pools"
        right={
          pools.data ? (
            <span className="small faint">{pools.data.totalPools} pools indexed</span>
          ) : null
        }
        padded={false}
      >
        {!pools.data ? (
          pools.error ? (
            <Notice tone="bad" hint={pools.error}>
              Could not read pools.
            </Notice>
          ) : (
            <Loading />
          )
        ) : pools.data.pools.length === 0 ? (
          <div className="empty">No pools indexed yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Venue</th>
                  <th className="right">TVL</th>
                  <th className="right">24h vol</th>
                  <th>Pool</th>
                </tr>
              </thead>
              <tbody>
                {pools.data.pools.map((p) => (
                  <tr key={p.poolId}>
                    <td className="strong">
                      {p.base.symbol ?? "?"} / {p.quote.symbol ?? "?"}
                    </td>
                    <td className="small dim">{p.venue}</td>
                    <td className="right">{usd(p.tvlUsd)}</td>
                    <td className="right dim">{usd(p.volume24h)}</td>
                    <td className="small">
                      <a
                        href={`https://cookiescan.io/address/${p.poolId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono"
                      >
                        {shortAddr(p.poolId)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
