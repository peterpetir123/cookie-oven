/**
 * Bazaar — Baked Bazaar, the NFT market on Cookie Chain.
 *
 * A grid rather than a table, because the thing being sold is an image and a
 * price, and a list of mints with no picture asks the buyer to open twelve tabs
 * to decide. That is the one place on this app where a card grid earns itself.
 *
 * Every listing that fails to buy comes back with the program's own error,
 * which is more useful here than a generic failure: a simulation failure on the
 * auction house program means the listing moved or the wallet is short, and the
 * message says which.
 */

import { useState } from "react";

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { useTransaction } from "../hooks/useTransaction.js";
import { Card, Empty, Loading, Notice, Stat } from "../components/ui.js";
import { Stages, TxFailure, TxSuccess } from "../components/Stages.js";
import { compact, shortAddr } from "../lib/format.js";
import type { ConnectedWallet } from "../lib/wallet.js";
import type { MarketStats, NftListingView, NftListingsResult } from "../lib/types.js";

const POLL_MS = 30000;

type Sort = "price" | "recent";

/** What `search_nfts` returns: a different shape from the plain listing. */
interface NftSearchResult {
  query: string;
  count: number;
  results: NftListingView[];
}

export function BazaarPage({ connection }: { connection: ConnectedWallet | null }) {
  const [sort, setSort] = useState<Sort>("price");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<string | null>(null);

  const stats = usePoll(() => read<MarketStats>(TOOL.marketStats), POLL_MS);

  // `searchNfts` takes a query and returns matches; the plain listing takes a
  // sort. Swapping between them rather than filtering client-side, because the
  // market holds more listings than any one page fetches. The two return
  // different shapes, so the union is resolved by which call was made.
  const listings = usePoll<NftListingView[]>(
    () =>
      search
        ? read<NftSearchResult>(TOOL.searchNfts, { query: search }).then((r) => r.results)
        : read<NftListingsResult>(TOOL.nftListings, { limit: 24, sort }).then((r) => r.listings),
    POLL_MS,
    [sort, search],
  );

  const items = listings.data ?? [];

  const floor = stats.data ? Number(stats.data.floorPrice) : null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Card
        title={`Baked Bazaar${stats.data ? ` · ${stats.data.marketplace}` : ""}`}
        right={
          <div className="row" style={{ gap: 6 }}>
            <button
              className={!search && sort === "price" ? "" : "ghost"}
              onClick={() => {
                setSearch(null);
                setSort("price");
              }}
            >
              cheapest
            </button>
            <button
              className={!search && sort === "recent" ? "" : "ghost"}
              onClick={() => {
                setSearch(null);
                setSort("recent");
              }}
            >
              recent
            </button>
          </div>
        }
      >
        <div className="grid cols-4">
          <Stat label="Listings" value={stats.data?.listingsCount ?? "—"} small />
          <Stat label="Floor" value={floor !== null ? `${compact(floor)} COOK` : "—"} small />
          <Stat label="Sales" value={stats.data?.salesCount ?? "—"} small />
          <Stat
            label="Volume"
            value={stats.data ? `${compact(Number(stats.data.totalVolume))} COOK` : "—"}
            small
          />
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(query.trim() || null);
            }}
            placeholder="Search by name or collection"
          />
          <button
            onClick={() => setSearch(query.trim() || null)}
            disabled={!query.trim()}
          >
            Search
          </button>
          {search ? (
            <button
              className="ghost"
              onClick={() => {
                setSearch(null);
                setQuery("");
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      </Card>

      {!listings.data ? (
        listings.error ? (
          <Notice tone="bad" hint={listings.error}>
            Could not read the market.
          </Notice>
        ) : (
          <Loading label="Loading listings" />
        )
      ) : items.length === 0 ? (
        <Empty>
          {search ? `Nothing listed matching "${search}".` : "No listings right now."}
        </Empty>
      ) : (
        <div className="grid cols-4">
          {items.map((l) => (
            <NftCard key={l.mint} listing={l} connection={connection} />
          ))}
        </div>
      )}

      {listings.error && listings.data ? (
        <Notice tone="warn" hint={listings.error}>
          Showing the last good read of the market.
        </Notice>
      ) : null}
    </div>
  );
}

function NftCard({
  listing,
  connection,
}: {
  listing: NftListingView;
  connection: ConnectedWallet | null;
}) {
  const tx = useTransaction();
  const [open, setOpen] = useState(false);

  const buy = async () => {
    if (!connection) return;
    await tx.run(TOOL.buyNft, { mint: listing.mint, maxPrice: listing.price }, connection);
  };

  const price = Number(listing.price);

  return (
    <div className="card" style={{ padding: 12, background: "var(--bg-raised-2)" }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          background: "var(--bg-input)",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 10,
          border: "1px solid var(--line)",
        }}
      >
        {listing.image ? (
          <img
            src={listing.image}
            alt={listing.name ?? "NFT"}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            className="small faint"
            style={{ display: "grid", placeItems: "center", height: "100%" }}
          >
            no image
          </div>
        )}
      </div>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="strong small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {listing.name ?? shortAddr(listing.mint)}
          </div>
          {listing.collection ? (
            <div className="tiny faint">{listing.symbol ?? "collection"}</div>
          ) : null}
        </div>
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <span className="mono small strong">{compact(price)}</span>
        <span className="tiny faint">COOK</span>
      </div>

      {tx.error ? (
        <div style={{ marginTop: 8 }}>
          <TxFailure
            message={tx.error.message}
            hint={tx.error.hint}
            onDismiss={tx.reset}
            onRetry={() => void buy()}
          />
        </div>
      ) : null}

      {tx.result ? (
        <div style={{ marginTop: 8 }}>
          <TxSuccess outcome={tx.result} onDismiss={tx.reset} />
        </div>
      ) : null}

      {open && tx.stages.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <Stages stages={tx.stages} />
        </div>
      ) : null}

      <button
        style={{ width: "100%", marginTop: 10 }}
        disabled={!connection || tx.running}
        title={connection ? undefined : "Connect a wallet first"}
        onClick={() => {
          setOpen(true);
          void buy();
        }}
      >
        {tx.running ? "Buying…" : "Buy"}
      </button>

      <div style={{ marginTop: 6 }}>
        <a href={listing.url} target="_blank" rel="noreferrer" className="tiny faint">
          Bazaar ↗
        </a>
      </div>
    </div>
  );
}
