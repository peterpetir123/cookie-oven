/**
 * Names — the `.cook` registry and its marketplace.
 *
 * Two things are happening on this page and they are deliberately not merged:
 *
 * - **Registering** a name from the registry, which has a price tier set by
 *   length. Short names cost real money, which is why the cost is shown before
 *   the form rather than discovered inside a failed transaction.
 * - **Buying** a name someone else already holds, from the marketplace, which is
 *   a different program and a different price.
 *
 * The resolution field is the reason the registry matters at all: it turns an
 * address you have to copy exactly into a name you can remember and check.
 */

import { useState } from "react";

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { useTransaction } from "../hooks/useTransaction.js";
import { Badge, Card, Empty, Loading, Notice, Stat } from "../components/ui.js";
import { Stages, TxFailure, TxSuccess } from "../components/Stages.js";
import { amount, compact, shortAddr } from "../lib/format.js";
import type { ConnectedWallet } from "../lib/wallet.js";
import type {
  DomainListing,
  DomainListingsResult,
  OwnedDomainsResult,
  ResolveDomainResult,
} from "../lib/types.js";

const POLL_MS = 30000;

export function NamesPage({ connection }: { connection: ConnectedWallet | null }) {
  const [newName, setNewName] = useState("");
  const [cap, setCap] = useState("");
  const [lookup, setLookup] = useState("");
  const [resolved, setResolved] = useState<ResolveDomainResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const tx = useTransaction();

  const listings = usePoll(
    () => read<DomainListingsResult>(TOOL.domainListings, { limit: 24, sort: "price" }),
    POLL_MS,
  );
  const owned = usePoll(
    () =>
      connection
        ? read<OwnedDomainsResult>(TOOL.ownedDomains, {}, { wallet: connection.address })
        : Promise.resolve(null),
    POLL_MS,
    [connection?.address],
    !!connection,
  );

  const label = newName.trim().toLowerCase().replace(/\.cook$/, "");
  const floor = listings.data ? Number(listings.data.floorPriceCook) : null;

  const register = async () => {
    if (!connection || !label) return;
    const outcome = await tx.run(
      TOOL.registerDomain,
      { name: label, ...(cap ? { maxPriceCook: cap } : {}) },
      connection,
    );
    if (outcome) {
      setNewName("");
      setCap("");
      owned.refresh();
      listings.refresh();
    }
  };

  const doLookup = async () => {
    const q = lookup.trim().toLowerCase().replace(/\.cook$/, "");
    if (!q) return;
    setLooking(true);
    setResolved(null);
    setLookupError(null);
    try {
      setResolved(await read<ResolveDomainResult>(TOOL.resolveDomain, { name: q }));
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid cols-2">
        <Card title="Register a .cook name">
          <label className="field">
            <span>Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="crumb"
              disabled={tx.running}
            />
            <small>
              {label ? `${label}.cook` : "Letters, numbers and dashes."} Shorter names cost more:
              4 or more characters are the cheaper tier.
            </small>
          </label>

          <label className="field">
            <span>Maximum you will pay (COOK)</span>
            <input
              value={cap}
              onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="Leave empty to be quoted instead"
              inputMode="decimal"
              disabled={tx.running}
            />
            <small>
              The registry charges what it charges. Leave this empty and the app asks for the price
              first rather than spending blind.
            </small>
          </label>

          {!connection ? (
            <Notice tone="info" hint="Registering a name is an on-chain purchase, paid by your wallet.">
              Connect a wallet to register a name.
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
                onRetry={() => void register()}
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
            disabled={!connection || !label || tx.running}
            onClick={() => void register()}
          >
            {tx.running ? "Working…" : `Register ${label || "…"}.cook`}
          </button>
        </Card>

        <div className="stack" style={{ gap: 12 }}>
          <Card title="Resolve a name">
            <div className="row" style={{ marginBottom: 10 }}>
              <input
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doLookup();
                }}
                placeholder="somebody"
                disabled={looking}
              />
              <button onClick={() => void doLookup()} disabled={looking || !lookup.trim()}>
                {looking ? "…" : "Look up"}
              </button>
            </div>

            {lookupError ? (
              <Notice tone="warn" hint={lookupError}>
                That name is not registered.
              </Notice>
            ) : resolved ? (
              <div className="stack" style={{ gap: 8 }}>
                <Stat label="Name" value={`${resolved.name}.cook`} small />
                <div>
                  <div className="stat-label">Owner</div>
                  <div className="mono small" style={{ wordBreak: "break-all" }}>
                    {resolved.owner}
                  </div>
                </div>
                {resolved.isPrimary ? (
                  <div>
                    <Badge tone="high">primary name</Badge>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="small faint">
                A .cook name resolves to a wallet address. It is how you send to a person instead of
                to a string you have to triple-check.
              </div>
            )}
          </Card>

          {listings.data ? (
            <Card title="Registry">
              <div className="grid cols-2">
                <Stat label="Listed" value={listings.data.totalListings} small />
                <Stat
                  label="Floor"
                  value={floor !== null ? `${compact(floor)} COOK` : "—"}
                  small
                />
              </div>
              <div className="small faint" style={{ marginTop: 12 }}>
                Marketplace fee {listings.data.marketplaceFee}. Buying a listed name is a purchase
                from its holder, not from the registry.
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {connection && owned.data && owned.data.domains.length > 0 ? (
        <Card title="Your names" padded={false}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Account</th>
                  <th>Registered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {owned.data.domains.map((d) => (
                  <tr key={d.account}>
                    <td className="strong">
                      {d.name}.cook {d.isPrimary ? <Badge tone="high">primary</Badge> : null}
                    </td>
                    <td className="small">
                      <a
                        href={`https://cookiescan.io/address/${d.account}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono faint"
                      >
                        {shortAddr(d.account)}
                      </a>
                    </td>
                    <td className="small faint">{d.createdAt?.slice(0, 10) ?? "—"}</td>
                    <td>
                      <a
                        href={`https://market.cookoven.xyz`}
                        target="_blank"
                        rel="noreferrer"
                        className="small"
                      >
                        Sell ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card
        title="Names for sale"
        right={listings.data ? <span className="small faint">{listings.data.count} listed</span> : null}
        padded={false}
      >
        {!listings.data ? (
          listings.error ? (
            <Notice tone="bad" hint={listings.error}>
              Could not read the marketplace.
            </Notice>
          ) : (
            <Loading />
          )
        ) : listings.data.listings.length === 0 ? (
          <Empty>Nothing listed right now.</Empty>
        ) : (
          <div style={{ padding: 16 }}>
            <div className="grid cols-3">
              {listings.data.listings.map((l) => (
                <ListingCard key={l.name} listing={l} connection={connection} onDone={listings.refresh} />
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ListingCard({
  listing,
  connection,
  onDone,
}: {
  listing: DomainListing;
  connection: ConnectedWallet | null;
  onDone: () => void;
}) {
  const tx = useTransaction();
  const [done, setDone] = useState(false);

  const buy = async () => {
    if (!connection) return;
    const outcome = await tx.run(
      TOOL.buyDomain,
      { name: listing.label, maxPriceCook: listing.priceCook },
      connection,
    );
    if (outcome) {
      setDone(true);
      onDone();
    }
  };

  return (
    <div className="card" style={{ background: "var(--bg-raised-2)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="strong">{listing.name}</div>
          <div className="small faint">{listing.length ?? listing.label.length} characters</div>
        </div>
        <Badge tone={done ? "high" : "info"}>{done ? "bought" : `${compact(Number(listing.priceCook))} COOK`}</Badge>
      </div>

      {tx.error ? (
        <div style={{ marginTop: 10 }}>
          <TxFailure message={tx.error.message} hint={tx.error.hint} onDismiss={tx.reset} onRetry={() => void buy()} />
        </div>
      ) : null}

      {tx.result ? (
        <div style={{ marginTop: 10 }}>
          <TxSuccess outcome={tx.result} onDismiss={tx.reset} />
        </div>
      ) : null}

      {!done ? (
        <button
          style={{ width: "100%", marginTop: 12 }}
          disabled={!connection || tx.running}
          onClick={() => void buy()}
          title={connection ? undefined : "Connect a wallet first"}
        >
          {tx.running ? "Working…" : amount(listing.priceCook) + " COOK"}
        </button>
      ) : null}
    </div>
  );
}
