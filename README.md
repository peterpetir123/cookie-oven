# Cookie Oven

**Launch tokens, trade live curves and bridge COOK on [Cookie Chain](https://www.cookiechain.wtf) — with a server that never holds your private key.**

Built for the Superteam Earn bounty [*Create an App on Cookie Chain*](https://superteam.fun/earn/listing/create-an-app-on-cookie-chain-app).

| | |
|---|---|
| **Live app** | https://cookie-oven-nine.vercel.app |
| **Repository** | https://github.com/peterpetir123/cookie-oven |
| **Chain** | Cookie Chain (SVM) — genesis `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2` |
| **Programs used** | MomoSwap launchpad `momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw`, Cookie DAS, Hyperlane warp route |

No program is deployed by this app — it drives Cookie Chain's genesis programs through
[`cookie-mcp`](https://github.com/cookiechain/cookie-mcp), so there is no new on-chain surface to
audit and nothing to trust beyond the chain itself.

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
| `npm run smoke` | Live smoke test against `localhost:8790` |
| `npm run smoke -- <url>` | The same checks against a deployment |
| `npm run lint` | oxlint |

### Verifying it on-chain

`npm run smoke` exercises the real handler against the live chain and needs no wallet and no COOK —
every action that would move funds stops at `needs_signature`, which is the property being checked.
Run against the deployment:

```console
$ npm run smoke -- https://cookie-oven-nine.vercel.app

  PASS  chain_health                       ok — absoluteSlot=26296398
  PASS  launchpad_pools                    ok — count=12
  PASS  balances                           ok — wallet="FFWf…4wq2"
  PASS  launchpad_buy                      needs_signature — buy, 1084 B unsigned
  PASS  bridge                             needs_signature — bridge, 1088 B unsigned
  PASS  write without a wallet is refused  refused — This action moves funds…
  PASS  unknown tool is refused            refused — Unknown tool "steal_keys".
  PASS  malformed address is refused       refused — "not-base58!!" is not a valid base58 address.

12 passed, 0 failed, 1 skipped
```

The skip is not a gap: `launchpad_sell` needs a position to sell, so the test discovers one and
skips when the test wallet holds none — asserting that a specific wallet holds a sellable position
on a specific day is not a promise this code can make.


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
api/mcp.ts                 The whole server: allowlist, wallet scoping, external-signer bridge,
                           and the Vercel transport. One file with no relative imports, because
                           Vercel compiles api/ but not files outside it.
server/dev.ts              Local Node sidecar (imports handle() from api/mcp.ts)
scripts/smoke.ts           Live end-to-end checks against a running API
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

## Deployment notes

The serverless deploy hit two failures that do not reproduce locally. Both are recorded because
they cost real time and neither is obvious from the error message:

1. **`ERR_MODULE_NOT_FOUND` for a `.ts` path.** Vercel compiles the TypeScript under `api/` but not
   files outside it, and does not rewrite import specifiers. `../server/handler.ts` therefore
   arrived at the runtime as a literal path to a file that was never compiled — while running fine
   locally under `tsx`, which *does* remap `.js` specifiers to `.ts` sources. The fix is one
   self-contained file rather than a workaround for one bad import.

2. **`ERR_REQUIRE_ESM` from `rpc-websockets`.** `rpc-websockets@9.3.9` — a `@solana/web3.js`
   dependency — declares `uuid@^14`, which is ESM-only, while its own `dist` is CommonJS and
   `require()`s it. Node 24 tolerates `require(esm)`; the Vercel runtime does not. `package.json`
   pins `uuid@^11` through `overrides`, which ships a CJS build with the same API surface. We never
   open a WebSocket connection, but the module is imported at load time.

The frontend deploys as a static build either way; only `/api/mcp` is a function.

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
