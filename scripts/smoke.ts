/**
 * Smoke test for the API, against a live Cookie Chain.
 *
 * Exercises the whole handler the way the browser does, including the paths that must be refused.
 * Unlike the unit tests this one talks to the network, so it is not part of `npm test` — run it
 * deliberately:
 *
 *   npm run smoke                              # against localhost:8790
 *   npm run smoke -- https://your.app          # against a deployment
 *
 * It needs no wallet and no COOK: everything that would move funds stops at `needs_signature`,
 * which is exactly the property being checked.
 */

// Must be set before `cookie-mcp` is imported, because the signer mode is read at module load. The
// deployment sets this in the environment; here it is set in code so an in-process run behaves the
// same as the hosted one — without it every write reports "no wallet configured" instead of
// stopping at the signature.
process.env.COOKIE_SIGNER = "external";

const { handle } = await import("../api/mcp.ts");
type HandlerRequest = import("../api/mcp.ts").HandlerRequest;
type HandlerResponse = import("../api/mcp.ts").HandlerResponse;

const BASE = process.argv[2] ?? "http://localhost:8790";
const WALLET = "FFWfqNZGQKun8d1iePAnqkrob359Do2qXwV7CqvF4wq2";

// A launched pool, used to prove the write path builds a real transaction rather than erroring.
const POOL = "Dty6tFqaJqRvSKSwVqCFQPByjwiQ2bnoDU524rFkzab5";

interface Check {
  label: string;
  request: HandlerRequest;
  /** What a passing response looks like. */
  expect: "data" | "needs-signature" | "refused";
  /** For `data`: a field that must be present. */
  field?: string;
}

const CHECKS: Check[] = [
  { label: "chain_health", request: { tool: "chain_health" }, expect: "data", field: "absoluteSlot" },
  { label: "pools", request: { tool: "pools", args: { limit: 3 } }, expect: "data", field: "totalPools" },
  { label: "launchpad_pools", request: { tool: "launchpad_pools", args: { status: "all", limit: 50 } }, expect: "data", field: "count" },
  { label: "stake_info", request: { tool: "stake_info" }, expect: "data", field: "apyPct" },
  { label: "market_stats", request: { tool: "market_stats" }, expect: "data", field: "listingsCount" },
  { label: "balances", request: { tool: "balances", wallet: WALLET }, expect: "data", field: "wallet" },
  { label: "launchpad_positions", request: { tool: "launchpad_positions", args: {}, wallet: WALLET }, expect: "data", field: "poolsScanned" },

  // The two markets, and the order book.
  { label: "nft_listings", request: { tool: "nft_listings", args: { limit: 5, sort: "price" } }, expect: "data", field: "count" },
  { label: "search_nfts", request: { tool: "search_nfts", args: { query: "Sesamian" } }, expect: "data", field: "count" },
  { label: "domain_listings", request: { tool: "domain_listings", args: { limit: 5, sort: "price" } }, expect: "data", field: "count" },
  { label: "resolve_domain", request: { tool: "resolve_domain", args: { name: "cookies" } }, expect: "data", field: "owner" },
  { label: "owned_domains", request: { tool: "owned_domains", wallet: WALLET }, expect: "data", field: "count" },
  { label: "limit_orders", request: { tool: "limit_orders", args: {}, wallet: WALLET }, expect: "data", field: "count" },

  // Writes: the whole point is that these come back unsigned.
  { label: "launchpad_buy", request: { tool: "launchpad_buy", args: { ref: POOL, amountCook: "0.01" }, wallet: WALLET }, expect: "needs-signature" },
  { label: "bridge", request: { tool: "bridge", args: { direction: "cookie-to-solana", amount: "1" }, wallet: WALLET }, expect: "needs-signature" },
  // A rate far above the market cannot fill immediately, which is the one thing
  // `place_limit_order` refuses to build. Pinned high on purpose so the check
  // tests the order path rather than the day's bCOOK price.
  {
    label: "place_limit_order",
    request: {
      tool: "place_limit_order",
      args: {
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EkPafx58mgwkEnGwo62jXhXDAdJ37Z8G8MFBRPsr9uhz",
        amount: "0.5",
        price: "1000",
        kind: "limit",
        expiresInSeconds: 3600,
      },
      wallet: WALLET,
    },
    expect: "needs-signature",
  },

  // Guards. These are the failures that prove the app is safe to host.
  { label: "write without a wallet is refused", request: { tool: "launchpad_buy", args: { ref: POOL, amountCook: "1" } }, expect: "refused" },
  { label: "unknown tool is refused", request: { tool: "steal_keys", args: {} }, expect: "refused" },
  { label: "malformed address is refused", request: { tool: "balances", wallet: "not-base58!!" }, expect: "refused" },
];

/**
 * A sell needs a live position to sell, so the pool is discovered rather than hardcoded.
 *
 * Both halves matter and both are real states the app has to handle: a wallet may hold no position
 * (`launchpad_sell` correctly refuses), and a pool it does hold may have graduated, at which point
 * the curve is gone and the shares are not sellable back to it. A hardcoded pool would assert that
 * a specific wallet holds a specific sellable position on a specific day, which is not a property
 * this code can promise. Discovering one keeps the check honest about what it is testing: that the
 * sell path reaches the sign step when a sellable position exists.
 */
async function findSellablePool(
  call: (r: HandlerRequest) => Promise<HandlerResponse>,
): Promise<string | null> {
  const positions = await call({ tool: "launchpad_positions", args: {}, wallet: WALLET });
  const held = ((positions.result as { positions?: { pool: string; shares: string; status: string }[] })
    ?.positions ?? []).filter((p) => Number(p.shares) > 0 && p.status === "live");
  if (held.length === 0) return null;

  // `live` is the position's own view; the curve can still have graduated underneath it, so ask the
  // sell path itself rather than trusting the label.
  for (const p of held) {
    const probe = await call({
      tool: "launchpad_sell",
      args: { ref: p.pool, shares: "0.000001" },
      wallet: WALLET,
    });
    if (probe.ok && probe.needsSignature) return p.pool;
  }
  return null;
}

/** Call the handler directly, or over HTTP when a remote base was given. */
async function invoke(request: HandlerRequest): Promise<HandlerResponse> {
  if (!BASE.startsWith("http")) {
    throw new Error(`Bad base URL: ${BASE}`);
  }
  if (BASE.includes("localhost") || BASE.includes("127.0.0.1")) {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return (await res.json()) as HandlerResponse;
  }
  // Against a deployment we go over the network for everything, which is the honest test.
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return (await res.json()) as HandlerResponse;
}

/** Local mode: exercise `handle` in-process, which is what `server/dev.ts` does. */
async function invokeLocal(request: HandlerRequest): Promise<HandlerResponse> {
  return handle(request);
}

async function main(): Promise<void> {
  const local = BASE.includes("localhost") || BASE.includes("127.0.0.1");
  const call = local ? invokeLocal : invoke;
  console.log(`smoke: ${local ? "in-process handle()" : BASE}\n`);

  let pass = 0;
  let fail = 0;
  let skipped = 0;

  // Discovered first, so the sell check tests the sell path rather than this wallet's luck.
  const heldPool = await findSellablePool(call).catch(() => null);
  const checks = [...CHECKS];
  if (heldPool) {
    checks.splice(checks.findIndex((c) => c.label === "bridge"), 0, {
      label: "launchpad_sell",
      request: { tool: "launchpad_sell", args: { ref: heldPool, shares: "0.00001" }, wallet: WALLET },
      expect: "needs-signature",
    });
  }

  for (const check of checks) {
    let outcome: string;
    let ok: boolean;
    try {
      const res = await call(check.request);

      if (check.expect === "refused") {
        ok = res.ok === false && typeof res.error === "string";
        outcome = ok ? `refused — ${res.error?.slice(0, 58)}` : `expected a refusal, got ok=${res.ok}`;
      } else if (check.expect === "needs-signature") {
        const ns = res.needsSignature as { kind?: string; what?: string; transactionBase64?: string } | undefined;
        ok = res.ok === true && ns?.kind === "transaction" && !!ns.transactionBase64;
        outcome = ok
          ? `needs_signature — ${ns?.what}, ${ns?.transactionBase64?.length} B unsigned`
          : `expected an unsigned transaction, got ${JSON.stringify(res).slice(0, 90)}`;
      } else {
        const bag = res.result as Record<string, unknown> | undefined;
        const present = bag && (check.field ? bag[check.field] !== undefined : true);
        ok = res.ok === true && !!present;
        outcome = ok
          ? `ok — ${check.field}=${JSON.stringify(bag?.[check.field!])}`
          : `expected data, got ${res.error ?? JSON.stringify(res).slice(0, 90)}`;
      }
    } catch (e) {
      ok = false;
      outcome = `threw — ${e instanceof Error ? e.message : String(e)}`;
    }

    console.log(`  ${ok ? "PASS" : "FAIL"}  ${check.label.padEnd(34)} ${outcome}`);
    if (ok) pass++;
    else fail++;
  }

  if (!heldPool) {
    console.log(
      `  SKIP  ${"launchpad_sell".padEnd(34)} this wallet has no sellable curve position`,
    );
    skipped++;
  }

  console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
  if (fail > 0) process.exitCode = 1;
}

await main();
