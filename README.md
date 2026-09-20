# Cookie Oven

**Launch tokens, trade live curves and bridge COOK on [Cookie Chain](https://www.cookiechain.wtf) — with a server that never holds your private key.**

Built for the Superteam Earn bounty [*Create an App on Cookie Chain*](https://superteam.fun/earn/listing/create-an-app-on-cookie-chain-app).

---

## What it is

Cookie Chain's activity lives on the MomoSwap bonding curve, and the launchpad shows one pool at a
time. Cookie Oven puts the whole curve on one screen and lets you act on it: bake a new token, buy
and sell curve shares, claim what a pool owes you, and bridge COOK in when you need gas.

The interesting part is not the UI. It is that the app does all of this **without a private key ever
existing on the server**.

## The design decision that matters

Every other approach to hosting an on-chain app means the backend holds a key. That is what makes
"deploy this app publicly" and "do not get your users' funds stolen" hard to satisfy at the same
time.

Cookie Oven sidesteps it by running [`cookie-mcp`](https://github.com/cookiechain/cookie-mcp) — the
official Cookie Chain MCP server — in **external signer mode**:

```
COOKIE_SIGNER=external
  |
  +-- runWithRequestContext({ wallet }, () => tool(args))
  |     |
  |     +-- the tool builds the transaction
  |     +-- verifies it against the API's own description
  |     +-- simulates it against the RPC
  |     +-- then throws `SignatureRequired` instead of signing
  |
  +-- we return the unsigned bytes to the browser
  +-- the user's wallet signs them
  +-- we broadcast over rpc.cookiescan.io
```

The server holds no key. Not in an env var, not in memory, not for a moment. A caller cannot make it
act for a wallet it cannot sign for, because the returned transaction is missing exactly that
wallet's signature.

### The wallet signs; we broadcast

Most wallet adapters offer `signAndSendTransaction`, and on a custom SVM network it is a trap: the
wallet broadcasts through its own configured RPC, which for a browser wallet is Solana mainnet. The
transaction is valid, the signature is real, nothing errors — it simply never confirms.

So this app calls `signTransaction` only and broadcasts itself. See `src/lib/tx.ts`.

## Verified against the live chain

Every constant in `src/lib/chain.ts` was read off Cookie Chain rather than copied from a doc:

| What | How it was verified | Value |
|---|---|---|
| Genesis hash | `getGenesisHash` | `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2` |
| Chain version | `getVersion` | `solana-core 4.1.2` |
| Block time | `getChainHealth` | ~1s (0.4–2.2 slots/sec observed) |
| Validators | `getChainHealth` | 4, none delinquent |
| Finality lag | `getChainHealth` | 32 slots |
| MomoSwap launchpad | `getAccountInfo` → executable | `momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw` |
| CookieBox DBC / DAMM / CLMM | `getAccountInfo` → executable | see `PROGRAMS` |
| Cookie `.cook` names | `getAccountInfo` → executable | `H43Qtq4AMQ86y7yc3YtCKZJ2QMhhnCcHyZKeFeoQn7PA` |
| Limit orders | `getAccountInfo` → executable | `L1M1tkE57jpgimzjs5S8HVsmwk4uwrWoDFuUvXpVniH` |
| Cookiescan DAS | live `getAsset` | 6,531 tokens indexed |
| Stake pool | `getStakeInfo` | ~175% APY, `bCOOK` |
| Baked Bazaar | `getMarketStats` | 122 listings, floor 5,000 COOK |

There is **no faucet** and **no devnet**. COOK is obtained only by bridging from Solana.

## Features

| Feature | Tool | Notes |
|---|---|---|
| **Oven** — launch a token | `deploy_token` | Two-phase: a `signMessage` login, then the launch transaction |
| **Radar** — every live curve | `get_launchpad_pools` | Graduation progress is the headline number, because it decides whether the sell side still works |
| **Trade** — buy / sell | `launchpad_buy`, `launchpad_sell` | Balance checked client-side *before* a wallet prompt |
| **Portfolio** — holdings | `balances`, `get_launchpad_positions` | |
| **Claim centre** | `claim_launchpad` | Scans every pool for refunds, payouts and creator fees nobody was told about |
| **Bridge** | `bridge` | Hyperlane warp route, in-app |
| **Pulse** — chain health | `get_chain_health`, `get_pools`, `get_stake_info`, `get_market_stats` | Every figure live, nothing mocked |

### Transaction lifecycle

Every write reports six stages, because a wallet signature can take as long as the user takes and a
bare spinner during that window is indistinguishable from a hang:

`prepare` → `guard` → `sign` → `submit` → `confirm` → `done`

Failures keep their stage and their hint, so "it didn't work" becomes "it built and simulated fine,
then you declined".

## Running locally

Requires **Node ≥ 22** (a `cookie-mcp` constraint) and a Solana-compatible wallet —
[Nightly](https://nightly.app) is what Cookie Chain supports, and the only wallet that will switch
its own network for you.

```bash
npm install
npm run dev          # API on :8790, web on :5173
```

Open http://localhost:5173.

Two processes, because `cookie-mcp` pulls in the Raydium, Orca and Anchor SDKs, which are Node-only
— it cannot run in a browser. `vite dev` serves the UI and proxies `/api` to the Node sidecar;
production puts the same handler behind a Vercel Function. One implementation, two transports.

| Command | What it does |
|---|---|
| `npm run dev` | Both processes |
| `npm run dev:api` | The Node sidecar alone |
| `npm run dev:web` | Vite alone |
| `npm run build` | Typecheck and build to `dist/` |
| `npm test` | Unit tests (`node:test`, no test framework dependency) |
| `npm run lint` | oxlint |

### Getting COOK

There is no faucet. Bridge from Solana at [hyperlane.cookiescan.io](https://hyperlane.cookiescan.io),
or use the **Bridge** tab. A few dollars of COOK is far more than enough — COOK trades around
$0.00008 and a program deploy costs about $0.05.

## Architecture

```
Browser (React + Vite)                Vercel Function /api/mcp           Cookie Chain
────────────────────────              ─────────────────────────          ─────────────
 Wallet Standard                       cookie-mcp (external signer)       rpc.cookiescan.io
   signTransaction ──┐                   no key, ever                     api.cookiescan.io (DAS)
   signMessage ──────┤                 ┌─ prepare: build + verify          MomoSwap
                     │                 ├─ simulate                        CookieBox
 tx pipeline ────────┴───────────────► └─ return unsigned ──┐              Hyperlane
   prepare → guard → sign → submit → confirm → done          │
                     ┌───────────────────────────────────────┘
                     └─► submit_signed_tx ──► rpc.cookiescan.io ──► confirmed
```

### Safety properties

- **No key server-side.** `COOKIE_SIGNER=external`; the launch of the sidecar refuses a local key.
- **Genesis guard.** `assertCookieChain()` compares the RPC's genesis against Cookie Chain's before
  any signature is requested, and refuses to build if they differ. Cached per session, since a
  genesis hash cannot change.
- **Allowlisted tools.** The request body is attacker-controlled, so the server names the 25 tools
  it will run rather than dispatching on whatever the client sends.
- **Wallet-scoped requests.** The connected address is passed per request and used only to pick the
  fee payer. A caller cannot act for a wallet it cannot sign for.
- **Balances checked before prompting.** An order that cannot fill never reaches a wallet popup — a
  signature request is a cost the user pays.

## Project layout

```
api/mcp.ts                 Vercel Function transport
server/
  handler.ts               Allowlist, wallet scoping, external-signer bridge
  dev.ts                   Local Node sidecar (same handler)
src/
  lib/
    chain.ts               RPC, genesis guard, program IDs, explorer URLs
    mcp.ts                 Client for /api/mcp
    tx.ts                  The six-stage pipeline
    wallet.ts              Wallet Standard + Nightly
    format.ts              Number formatting for Cookie Chain's range
    types.ts               Backend response shapes
  hooks/
    useWallet.ts           Connection, silent reconnect, network switch
    useTransaction.ts      Pipeline state for components
    usePoll.ts             Safe polling (no overlap, backoff, keeps stale data)
  pages/                   Oven · Radar · Trade · Portfolio · Bridge · Pulse
  components/              ui.tsx · Stages.tsx · WalletButton.tsx
tests/                     format · handler
```

## Known limits

- **The launchpad API drops pools it cannot decode.** A recent response reported `count: 12,
  skipped: 10`. The Radar tab says so on screen rather than quietly under-reporting; reading those
  pool accounts directly over RPC is the fix.
- **The Cookiebox aggregator returns "no route found" for some pairs**, including COOK↔bCOOK at the
  time of writing, while `getQuote` routes the same pair successfully through its own path. Trading
  goes through `cookie-mcp`'s router, which handles this.
- **No `prefers-reduced-motion` pass.** The spinners animate unconditionally.
- **Curve positions are not tokens.** Until a pool graduates there is no SPL token to show; the
  Portfolio tab names the pool and the shares rather than inventing a symbol.

## Licence

MIT.
