/**
 * Cookie Chain network constants and the guards that stand between the user and a signature.
 *
 * Everything here is verified against the live chain (see README § "Verified against the live
 * chain"). Nothing is guessed, and no address is copied from a blog post.
 */

import { Connection, PublicKey } from "@solana/web3.js";

/** Community RPC. The only endpoint this app talks to for Cookie Chain state. */
export const COOKIE_CHAIN_RPC = "https://rpc.cookiescan.io";
export const COOKIE_CHAIN_WS = "wss://wss.cookiescan.io";

/** Explorer + APIs. */
export const EXPLORER_URL = "https://cookiescan.io";
export const COOKIESCAN_API = "https://api.cookiescan.io";

/**
 * Genesis hash of Cookie Chain. Confirmed via `getGenesisHash` against the live RPC.
 *
 * This is the single most important constant in the app: it is what stops us building a
 * transaction against Solana mainnet and handing it to a user who thinks they are on Cookie Chain.
 * The two chains have different history, so a transaction that is valid on one is meaningless on
 * the other, and the failure mode is silent — the wallet signs, the RPC accepts, and the signature
 * simply never confirms.
 */
export const COOKIE_CHAIN_GENESIS = "9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2";

/** Native gas token. Note the same base58 string is wSOL on Solana — branch on the chain, never on the mint. */
export const COOK_MINT = "So11111111111111111111111111111111111111112";
export const COOK_DECIMALS = 9;
export const COOK_SYMBOL = "COOK";

/** Liquid staked COOK. */
export const BCOOK_MINT = "EkPafx58mgwkEnGwo62jXhXDAdJ37Z8G8MFBRPsr9uhz";
export const BCOOK_SYMBOL = "bCOOK";

/**
 * Programs embedded at Cookie Chain genesis that this app reads or calls.
 * Source: docs.cookiechain.wtf/ecosystem, each verified executable via `getAccountInfo`.
 */
export const PROGRAMS = {
  splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  ata: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  memo: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  cookieDomains: "H43Qtq4AMQ86y7yc3YtCKZJ2QMhhnCcHyZKeFeoQn7PA",
  cookieDomainsMarket: "Ey35mr69UfiQqZSwD2qYAZoMNfnuVJGCjwNSB64ppHm7",
  momoswapLaunchpad: "momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw",
  cookieboxDamm: "DAMMjDCEFTDkt7ywazZS8GoaLtjb3HaJo3pLbf64xrPY",
  cookieboxClmm: "CLMMmWqTtyNSomqXP3kETJy2SGKPdr31USsm4GfbLyKs",
  cookieswapBamm: "WTzkPUoprVx7PDc1tfKA5sS7k1ynCgU89WtwZhksHX5",
  cookieswapXybn: "xYBN2zddsqSy41tg1yD9nJScCmqquZnHUyzXBfLEqC8",
  limitOrder: "L1M1tkE57jpgimzjs5S8HVsmwk4uwrWoDFuUvXpVniH",
  jupiter: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
} as const;

let _connection: Connection | null = null;

/**
 * The one Connection in the app. `confirmed` rather than `finalized`: at ~1s blocks and a ~32 slot
 * finalization lag the user would otherwise stare at a spinner for half a minute after the chain
 * had already accepted their transaction.
 */
export function connection(): Connection {
  if (!_connection) {
    _connection = new Connection(COOKIE_CHAIN_RPC, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60_000,
    });
  }
  return _connection;
}

export function explorerTx(sig: string): string {
  return `${EXPLORER_URL}/tx/${sig}`;
}

export function explorerAddress(addr: string): string {
  return `${EXPLORER_URL}/address/${addr}`;
}

export function explorerToken(mint: string): string {
  return `${EXPLORER_URL}/token/${mint}`;
}

/** Hyperlane warp route between Solana and Cookie Chain — the only way COOK gets in or out. */
export const BRIDGE_URL = "https://hyperlane.cookiescan.io";

/**
 * Close enough to 1 COOK that the difference is below display precision.
 *
 * Solana's rent-exempt minimum for a token account, kept as COOK rather than lamports so the
 * "you need a little more" hint can be stated in the unit the user is actually holding.
 */
export const RENT_EXEMPT_COOK = 0.00203928;

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

export interface GuardResult {
  ok: boolean;
  /** Present when `ok` is false. Plain language, already suitable for display. */
  reason?: string;
  genesis?: string;
  rpcGenesis?: string;
}

/**
 * Cheap sanity check that the RPC we are configured for is actually Cookie Chain.
 *
 * Cached: the genesis hash of a chain cannot change, so one successful check per session is enough
 * and doing it before every signature would add a round trip to every action for no new information.
 */
let _genesisOk: string | null = null;

export async function assertCookieChain(): Promise<GuardResult> {
  if (_genesisOk) return { ok: true, genesis: COOKIE_CHAIN_GENESIS, rpcGenesis: _genesisOk };

  try {
    const genesis = await connection().getGenesisHash();
    if (genesis !== COOKIE_CHAIN_GENESIS) {
      return {
        ok: false,
        reason:
          `The RPC is answering for a different chain (genesis ${genesis.slice(0, 8)}…, ` +
          `expected ${COOKIE_CHAIN_GENESIS.slice(0, 8)}…). Refusing to build a transaction: ` +
          `anything signed here would never confirm on Cookie Chain.`,
        genesis: COOKIE_CHAIN_GENESIS,
        rpcGenesis: genesis,
      };
    }
    _genesisOk = genesis;
    return { ok: true, genesis: COOKIE_CHAIN_GENESIS, rpcGenesis: genesis };
  } catch (e) {
    return {
      ok: false,
      reason: `Could not reach Cookie Chain at ${COOKIE_CHAIN_RPC} to verify the chain: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
}

/** Reset the cached genesis result. Test seam. */
export function _resetGenesisGuard(): void {
  _genesisOk = null;
  _connection = null;
}

export function isValidPublicKey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

/** Shorten an address for display without lying about its length. */
export function shortAddress(s: string, head = 4, tail = 4): string {
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
