/**
 * Local dev server.
 *
 * Exists because the interesting half of this app cannot run in a browser: `cookie-mcp` pulls in
 * the Raydium, Orca and Anchor SDKs, which are Node-only. So `vite dev` serves the UI and proxies
 * `/api` here, and production puts the same handler behind a Vercel Function. One implementation,
 * two transports — see `api/mcp.ts` for the other one.
 *
 *   node --import tsx server/dev.ts      (or: npm run dev:api)
 */

import http from "node:http";

import { handle, type HandlerRequest } from "./handler.ts";

const PORT = Number(process.env.PORT ?? 8790);

// Set before `cookie-mcp` reads it, which happens per call rather than at import.
process.env.COOKIE_SIGNER = "external";

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, signer: process.env.COOKIE_SIGNER }));
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", async () => {
    let body: HandlerRequest;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as HandlerRequest;
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `Bad JSON: ${e}` }));
      return;
    }
    const started = Date.now();
    const out = await handle(body);
    const ms = Date.now() - started;
    console.log(
      `${body.tool}${body.wallet ? ` [${body.wallet.slice(0, 4)}…]` : ""} ` +
        `${out.ok ? (out.needsSignature ? "needs_signature" : "ok") : `error: ${out.error}`} ${ms}ms`,
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  });
});

server.listen(PORT, () => {
  console.log(`cookie-oven api on http://localhost:${PORT}  (COOKIE_SIGNER=external)`);
});
