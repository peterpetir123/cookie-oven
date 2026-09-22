/**
 * Shapes returned by the backend.
 *
 * These mirror `cookie-mcp`'s own result types. They are declared rather than imported because the
 * package's types resolve against a Node-only dependency graph, and pulling that into the browser
 * bundle to get a named field would defeat the point of having a server in the middle.
 *
 * Only the fields this app actually renders are named. The backend passes the rest through
 * untouched, so a new field becomes available without a change here — it just is not typed yet.
 */

export interface LaunchpadPool {
  pool: string;
  mint: string;
  name: string;
  symbol: string;
  status: string;
  expiryMode: string;
  creator: string;
  metadataUri: string;
  priceCook: number;
  raisedCook: string;
  graduationTargetCook: string;
  graduationProgressPct: number;
  tokensSold: string;
  saleSupply: string;
  participants: number;
  launchAt: string;
  endsAt: string;
  antiSnipe: boolean;
  links?: { launchpad?: string; token?: string };
}

export interface LaunchpadPoolsResult {
  count: number;
  status: string;
  program: string;
  pools: LaunchpadPool[];
}

export interface LaunchpadToken {
  pool: string;
  mint: string;
  name: string;
  symbol: string;
  status: string;
  expiryMode: string;
  priceCook: number;
  raisedCook: string;
  graduationTargetCook: string;
  graduationProgressPct: number;
  participants: number;
  endsAt: string;
  /** Present once the pool has graduated and the real SPL token exists. */
  quote?: { tokensPerCook?: string; cookPerToken?: string } | null;
}

export interface PoolView {
  poolId: string;
  venue: string;
  base: { mint: string; symbol: string | null };
  quote: { mint: string; symbol: string | null };
  tvlUsd: number | null;
  volume24h: number | null;
  liquidityDisplay?: string;
}

export interface PoolsResult {
  count: number;
  totalPools: number;
  sort: string;
  pools: PoolView[];
}

export interface QuoteResult {
  chain: string;
  aggregator: string;
  input: { mint: string; symbol: string | null; amount: string };
  output: { mint: string; symbol: string | null; expectedOut: string; outAfterFee: string; minOut: string };
  priceImpactPct: string;
  slippageBps: number;
  aggregatorFee?: { bps: number; amount: string };
  route: {
    split: boolean;
    multiHop: boolean;
    lowLiquidity: boolean;
    hops: { venue: string; poolAddress: string; inAmountRaw: string; outAmountRaw: string }[];
  };
}

export interface TokenInfo {
  mint: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  description?: string | null;
  logo?: string | null;
  price?: { usd?: string; cook?: string } | null;
  supply?: string | null;
  holderCount?: number | null;
}

export interface TokenSearchResult {
  mint: string;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  priceCook: number | null;
  liquidityCook: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  holderCount: number | null;
  explorerUrl: string;
}

export interface WalletBalances {
  wallet: string;
  cook: { amount: string; usdValue: number | null };
  tokens: {
    mint: string;
    symbol: string | null;
    amount: string;
    decimals: number;
    usdValue: number | null;
  }[];
}

export interface PositionView {
  pool: string;
  mint: string;
  symbol: string;
  status: string;
  expiryMode: string;
  shares: string;
  investedCook: string;
  withdrawnCook: string;
  estimatedValueCook: string | null;
  action?: { tool: string; kind: string; reason: string } | null;
  links?: { launchpad?: string; token?: string };
}

export interface PositionsResult {
  owner: string;
  poolsScanned: number;
  positions: PositionView[];
  note?: string;
}

export interface StakeInfo {
  bcookMint: string;
  stakePool: string;
  program: string;
  rate: number;
  rateLabel?: string;
  cookPerBcook?: number;
  bcookPerCook?: number;
  tvlCook: string;
  bcookSupply: string;
  fees: { depositPct: number; withdrawPct: number };
  apyPct: number;
  links?: { pool?: string };
}

export interface ChainHealth {
  healthy: boolean;
  status: string;
  slots: { processed: number; confirmed: number; finalized: number };
  finalizationLag: number;
  finalizationStalled: boolean;
  epoch: number;
  epochProgressPct: number;
  absoluteSlot: number;
  blockHeight: number;
  version: string;
  slotsPerSec: number;
  validatorCount: number;
  delinquentCount: number;
  clusterNodeCount: number;
  rpc: { endpoint: string; latencyMs: number };
}

export interface MarketStats {
  listingsCount: number;
  floorPrice: string;
  totalVolume: string;
  volume24h: string;
  salesCount: number;
  salesCount24h: number;
  feePct: number;
  marketplace: string;
}

export interface DomainListing {
  name: string;
  label: string;
  priceCook: string;
  priceLamports?: string;
  seller: string;
  domain?: string;
  listing?: string;
  createdAt?: string;
  length?: number;
}

export interface DomainListingsResult {
  count: number;
  totalListings: number;
  marketplaceFee: string;
  feeBps: number;
  floorPriceCook: string;
  marketUrl: string;
  listings: DomainListing[];
}

/* ------------------------------------------------------------ limit orders */

export interface LimitOrderView {
  order: string;
  kind: "limit" | "stop";
  /** `expired` means the input is still escrowed and has to be cancelled to get it back. */
  status: "open" | "filling" | "expired";
  input: { mint: string; symbol: string | null; remaining: string; original: string };
  output: { mint: string; symbol: string | null; minReceive: string; netAfterFee: string };
  /** Output per input in human units. For a stop order this is the trigger, not a rate. */
  price: number | null;
  expiresAt?: string | null;
  createdAt?: string | null;
}

export interface LimitOrdersResult {
  owner: string;
  ownerName?: string;
  fees: { makerFeeBps: number; makerStableFeeBps: number; takerFeeBps: number; takerStableFeeBps: number } | null;
  count: number;
  orders: LimitOrderView[];
}

/* --------------------------------------------------------------- .cook names */

export interface ResolveDomainResult {
  name: string;
  owner: string;
  address?: string;
  isPrimary?: boolean;
  resolver?: string | null;
}

export interface OwnedDomain {
  name: string;
  label: string;
  account: string;
  isPrimary: boolean;
  resolver: string | null;
  metadata: string | null;
  createdAt: string | null;
}

export interface OwnedDomainsResult {
  wallet: string;
  count: number;
  domains: OwnedDomain[];
}

/* ------------------------------------------------------------- Baked Bazaar */

export interface NftListingView {
  mint: string;
  name?: string;
  symbol?: string;
  price: string;
  priceLamports: string;
  seller: string;
  image?: string;
  collection?: string;
  listing: string;
  url: string;
}

export interface NftListingsResult {
  count: number;
  listings: NftListingView[];
}
