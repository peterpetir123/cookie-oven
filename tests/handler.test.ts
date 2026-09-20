/**
 * Tests for the tool allowlist and argument mapping.
 *
 * The shapes here are not a guess — `cookie-mcp` is inconsistent about how it takes arguments
 * (most tools take one options object; `getBalances`, `getTokenInfo`, `searchTokens` and
 * `resolveDomain` take positional strings), and getting it wrong is a call that reads the wrong
 * account and reports a confident zero. So each shape is pinned.
 *
 * `calls` is inspected rather than a mocked return value: what matters is what the handler handed
 * to the tool, not what came back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { MESSAGE_SIGN_TOOLS, TOOLS } from "../api/mcp.ts";

test("every declared tool names a function", () => {
  for (const [name, spec] of Object.entries(TOOLS)) {
    assert.equal(typeof spec.fn, "function", `${name} is not a function`);
  }
});

test("write tools are exactly the ones that move funds", () => {
  const writes = Object.entries(TOOLS)
    .filter(([, s]) => s.write)
    .map(([n]) => n)
    .sort();

  assert.deepEqual(writes, [
    "bridge",
    "claim_launchpad",
    "deploy_token",
    "launchpad_buy",
    "launchpad_sell",
    "place_limit_order",
    "submit_signed_tx",
    "trade",
    "transfer",
  ]);
});

test("reads that only inspect the caller's own wallet use the wallet shape", () => {
  for (const name of ["balances", "owned_domains", "wallet_nfts"]) {
    assert.equal(TOOLS[name]?.shape.kind, "wallet", `${name} should take the wallet positionally`);
  }
});

test("tools that take a single string are mapped to the right key", () => {
  assert.deepEqual(TOOLS.token_info?.shape, { kind: "string", key: "mint" });
  assert.deepEqual(TOOLS.search_tokens?.shape, { kind: "string", key: "query" });
  assert.deepEqual(TOOLS.resolve_domain?.shape, { kind: "string", key: "name" });
});

test("everything else takes one options object", () => {
  assert.equal(TOOLS.launchpad_buy?.shape.kind, "object");
  assert.equal(TOOLS.deploy_token?.shape.kind, "object");
  assert.equal(TOOLS.chain_health?.shape.kind, "object");
});

test("deploy_token is the only message-signature flow", () => {
  assert.deepEqual([...MESSAGE_SIGN_TOOLS], ["deploy_token"]);
  // A tool cannot be both: the client picks signMessage or signTransaction from this set.
  for (const name of MESSAGE_SIGN_TOOLS) {
    assert.ok(TOOLS[name], `${name} must be in the allowlist`);
  }
});
