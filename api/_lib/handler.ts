/**
 * The bridge between the browser and `cookie-mcp`.
 *
 * This is the whole trick of the app: `cookie-mcp` holds every Cookie Chain instruction we need —
 * launching on the MomoSwap curve, buying and selling shares, claiming, bridging over Hyperlane,
 * placing limit orders, reading `.cook` domains — but its signing functions assume a key in the
 * process. We never want that. So this handler runs `cookie-mcp` in **external signer mode**:
 *
 *   COOKIE_SIGNER=external
 *   runWithRequestContext({ wallet }, () => tool(args))
 *     -> the tool builds, verifies and simulates the transaction
 *     -> then throws `SignatureRequired` instead of signing
 *     -> we return the unsigned bytes to the browser
 *     -> the user's wallet signs them
 *     -> `submit_signed_tx` sends them over rpc.cookiescan.io
 *
 * No private key ever exists on the server. Not in an env var, not in memory, not for a moment.
 * That is the property that makes this safe to host publicly, and it is the reason the app can be
 * deployed at all rather than asking judges to run it locally.
 *
 * The wallet is not trusted either: it is passed per request and used only to pick the fee payer.
 * A caller cannot make this server act for a wallet it cannot sign for, because the returned
 * transaction is missing exactly that wallet's signature.
 */

import * as mcp from "cookie-mcp";

export interface HandlerRequest {
  /** Tool name from the allowlist below. */
  tool: string;
  /** Tool arguments, passed through untouched. */
  args?: unknown;
  /** base58 address of the connected wallet, or null for read-only calls. */
  wallet?: string | null;
  /** Signatures the client already collected (wallet-login flows return one and expect it back). */
  providedSignatures?: { message: string; signature: string }[];
}

export interface HandlerResponse {
  ok: boolean;
  /** Present when ok. The tool's own return value, untouched. */
  result?: unknown;
  /** Present when the tool stopped at the sign step. */
  needsSignature?: unknown;
  /** Present when ok is false. */
  error?: string;
  hint?: string;
}

/**
 * How a tool wants its arguments handed over.
 *
 * `cookie-mcp` is not uniform about this: most tools take one options object, but the older reads
 * take positional strings (`getBalances(wallet)`, `getTokenInfo(mint)`, `searchTokens(query, limit)`).
 * Spelling that out here rather than trying to guess from `fn.length` — a guess that is wrong at
 * runtime is a call that silently reads the wrong account.
 */
type Shape =
  /** `fn(argsObject)` */
  | { kind: "object" }
  /** `fn(walletAddress)` — the connected wallet, from the request rather than the body. */
  | { kind: "wallet" }
  /** `fn(args[key])` — one positional string pulled out of the body. */
  | { kind: "string"; key: string };

interface ToolSpec {
  fn: (...a: never[]) => unknown;
  /** Moves funds or changes on-chain state. Refused without a connected wallet. */
  write: boolean;
  shape: Shape;
}

/**
 * Every tool this server will run.
 *
 * An allowlist rather than "call whatever the client names": the request body is attacker-controlled
 * by definition, and `cookie-mcp` exports 225 symbols of which most are internal helpers that assume
 * things about their arguments. Naming the permitted surface keeps the blast radius to tools that
 * were designed to be called from outside.
 *
 * `write` tools are additionally refused when no wallet is supplied — see `handle`.
 */
export const TOOLS: Record<string, ToolSpec> = {
  // ---- reads: no wallet required ----
  chain_health: { fn: mcp.getChainHealth as never, write: false, shape: { kind: "object" } },
  pools: { fn: mcp.getPools as never, write: false, shape: { kind: "object" } },
  launchpad_pools: { fn: mcp.getLaunchpadPools as never, write: false, shape: { kind: "object" } },
  launchpad_token: { fn: mcp.getLaunchpadToken as never, write: false, shape: { kind: "object" } },
  quote: { fn: mcp.getQuote as never, write: false, shape: { kind: "object" } },
  token_info: { fn: mcp.getTokenInfo as never, write: false, shape: { kind: "string", key: "mint" } },
  search_tokens: { fn: mcp.searchTokens as never, write: false, shape: { kind: "string", key: "query" } },
  stake_info: { fn: mcp.getStakeInfo as never, write: false, shape: { kind: "object" } },
  market_stats: { fn: mcp.getMarketStats as never, write: false, shape: { kind: "object" } },
  nft_listings: { fn: mcp.getNftListings as never, write: false, shape: { kind: "object" } },
  domain_listings: { fn: mcp.getDomainListings as never, write: false, shape: { kind: "object" } },
  resolve_domain: { fn: mcp.resolveDomain as never, write: false, shape: { kind: "string", key: "name" } },

  // ---- reads that need to know whose wallet to look at ----
  balances: { fn: mcp.getBalances as never, write: false, shape: { kind: "wallet" } },
  owned_domains: { fn: mcp.getOwnedDomains as never, write: false, shape: { kind: "wallet" } },
  wallet_nfts: { fn: mcp.getWalletNfts as never, write: false, shape: { kind: "wallet" } },
  launchpad_positions: { fn: mcp.getLaunchpadPositions as never, write: false, shape: { kind: "object" } },

  // ---- writes: build a transaction, stop at the signature ----
  launchpad_buy: { fn: mcp.launchpadBuy as never, write: true, shape: { kind: "object" } },
  launchpad_sell: { fn: mcp.launchpadSell as never, write: true, shape: { kind: "object" } },
  claim_launchpad: { fn: mcp.claimLaunchpad as never, write: true, shape: { kind: "object" } },
  deploy_token: { fn: mcp.deployToken as never, write: true, shape: { kind: "object" } },
  bridge: { fn: mcp.bridge as never, write: true, shape: { kind: "object" } },
  transfer: { fn: mcp.transfer as never, write: true, shape: { kind: "object" } },
  trade: { fn: mcp.trade as never, write: true, shape: { kind: "object" } },
  place_limit_order: { fn: mcp.placeLimitOrder as never, write: true, shape: { kind: "object" } },
  submit_signed_tx: { fn: mcp.submitSignedTransaction as never, write: true, shape: { kind: "object" } },
};

/**
 * Tools whose first call returns a message to sign rather than a transaction.
 *
 * `deploy_token` logs the wallet in before it can build anything, and the launchpad's login is a
 * `signMessage` — a different shape from the `signTransaction` every other write uses. The client
 * has to know, because it is the one that decides which wallet method to call.
 */
export const MESSAGE_SIGN_TOOLS = new Set(["deploy_token"]);

export async function handle(req: HandlerRequest): Promise<HandlerResponse> {
  const entry = TOOLS[req.tool];
  if (!entry) {
    return {
      ok: false,
      error: `Unknown tool "${req.tool}".`,
      hint: `Permitted tools: ${Object.keys(TOOLS).join(", ")}`,
    };
  }

  const wallet = req.wallet?.trim() || null;
  // A bad address must not be ignored: `getLaunchpadPositions` on a malformed owner comes back as a
  // confident empty portfolio, which reads as "you own nothing" rather than "that is not an address".
  if (wallet && !looksLikeAddress(wallet)) {
    return { ok: false, error: `"${wallet}" is not a valid base58 address.` };
  }
  if (entry.write && !wallet) {
    return {
      ok: false,
      error: "This action moves funds, so it needs a connected wallet.",
      hint: "Connect Nightly (or any Wallet Standard wallet) and try again.",
    };
  }

  try {
    const result = await mcp.runWithRequestContext(
      {
        ...(wallet ? { wallet } : {}),
        ...(req.providedSignatures?.length ? { providedSignatures: req.providedSignatures } : {}),
      },
      async () => invoke(entry, req.args, wallet),
    );
    return { ok: true, result };
  } catch (e) {
    // The expected, non-error exit for every write tool.
    if (e instanceof mcp.SignatureRequired) {
      return { ok: true, needsSignature: e.payload };
    }
    const message = e instanceof Error ? e.message : String(e);
    const hint =
      e instanceof mcp.CookieMcpError ? (e as unknown as { hint?: string }).hint : undefined;
    return { ok: false, error: message, ...(hint ? { hint } : {}) };
  }
}

/** Turn the request into the positional-or-object call the tool actually wants. */
function invoke(spec: ToolSpec, args: unknown, wallet: string | null): Promise<unknown> {
  const fn = spec.fn as unknown as (...a: unknown[]) => Promise<unknown>;
  switch (spec.shape.kind) {
    case "wallet":
      return fn(wallet ?? undefined);
    case "string": {
      const bag = (args ?? {}) as Record<string, unknown>;
      return fn(bag[spec.shape.key]);
    }
    case "object":
    default:
      return fn(args ?? {});
  }
}

/** Loose base58 check — length and alphabet only. `cookie-mcp` does the real decode. */
function looksLikeAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}
