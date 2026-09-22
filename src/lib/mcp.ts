/**
 * The client half of the external-signer dance.
 *
 * One function, `call`, talks to `/api/mcp`. Everything else in `src/` goes through it, so there is
 * exactly one place that knows the request shape and exactly one place to change if the transport
 * does.
 *
 * The important behaviour is in `needsSignature`: a write tool does not return a signature, it
 * returns a transaction that is complete except for the user's signature. That payload is the
 * handoff point — see `tx.ts` for what happens to it next.
 */

export interface NeedsSignatureTx {
  kind: "transaction";
  what: string;
  signer: string;
  transactionBase64: string;
  version: "legacy" | "v0";
  blockhash?: string;
  lastValidBlockHeight?: number;
  submit: { via: string; pools?: string[] };
  step: "final" | "intermediate";
  summary?: Record<string, unknown>;
  next: string;
}

export interface NeedsSignatureMessage {
  kind: "message";
  what: string;
  signer: string;
  message: string;
  next: string;
}

export type NeedsSignature = NeedsSignatureTx | NeedsSignatureMessage;

export interface CallResult<T = unknown> {
  ok: boolean;
  result?: T;
  needsSignature?: NeedsSignature;
  error?: string;
  hint?: string;
}

export interface CallOptions {
  wallet?: string | null;
  providedSignatures?: { message: string; signature: string }[];
}

/** An error carrying the server's own wording, so callers can show it verbatim. */
export class ApiError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ApiError";
    this.hint = hint;
  }
}

const ENDPOINT = "/api/mcp";

export async function call<T = unknown>(
  tool: string,
  args: unknown,
  opts: CallOptions = {},
): Promise<CallResult<T>> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tool,
        args,
        wallet: opts.wallet ?? null,
        ...(opts.providedSignatures ? { providedSignatures: opts.providedSignatures } : {}),
      }),
    });
  } catch (e) {
    throw new ApiError(
      `Could not reach the Cookie Oven backend at ${ENDPOINT}.`,
      e instanceof Error ? e.message : String(e),
    );
  }

  let body: CallResult<T>;
  try {
    body = (await res.json()) as CallResult<T>;
  } catch {
    throw new ApiError(`The backend returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (!body.ok) throw new ApiError(body.error ?? "Unknown error", body.hint);
  return body;
}

/** Call a tool that is expected to answer with data, and unwrap the result. */
export async function read<T>(tool: string, args: unknown = {}, opts: CallOptions = {}): Promise<T> {
  const r = await call<T>(tool, args, opts);
  if (r.result === undefined) {
    throw new ApiError(`"${tool}" returned no data.`);
  }
  return r.result;
}

/**
 * Call a tool that is expected to stop at the signature.
 *
 * A tool that returns data instead is a bug in the caller, not a success — for example asking to
 * buy before connecting a wallet — so it is surfaced rather than swallowed.
 */
export async function prepare(
  tool: string,
  args: unknown,
  opts: CallOptions = {},
): Promise<NeedsSignature> {
  const r = await call(tool, args, opts);
  if (!r.needsSignature) {
    throw new ApiError(
      `"${tool}" did not return a transaction to sign.`,
      r.result ? `It returned: ${JSON.stringify(r.result).slice(0, 200)}` : undefined,
    );
  }
  return r.needsSignature;
}

export const TOOL = {
  chainHealth: "chain_health",
  pools: "pools",
  launchpadPools: "launchpad_pools",
  launchpadToken: "launchpad_token",
  launchpadPositions: "launchpad_positions",
  launchpadBuy: "launchpad_buy",
  launchpadSell: "launchpad_sell",
  claimLaunchpad: "claim_launchpad",
  deployToken: "deploy_token",
  quote: "quote",
  tokenInfo: "token_info",
  searchTokens: "search_tokens",
  balances: "balances",
  bridge: "bridge",
  transfer: "transfer",
  stakeInfo: "stake_info",
  marketStats: "market_stats",
  submitSigned: "submit_signed_tx",

  // Limit and stop orders.
  limitOrders: "limit_orders",
  placeLimitOrder: "place_limit_order",
  cancelLimitOrder: "cancel_limit_order",

  // Baked Bazaar, the NFT market.
  nftListings: "nft_listings",
  searchNfts: "search_nfts",
  buyNft: "buy_nft",
  walletNfts: "wallet_nfts",

  // .cook names.
  domainListings: "domain_listings",
  resolveDomain: "resolve_domain",
  ownedDomains: "owned_domains",
  registerDomain: "register_domain",
  buyDomain: "buy_domain",
  listDomain: "list_domain",
} as const;
