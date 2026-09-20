/**
 * Vercel Function: POST /api/mcp
 *
 * A thin transport around `server/handler.ts`. It exists so the deployed app can reach
 * `cookie-mcp`'s instruction builders without shipping a key to the browser and without a second
 * always-on process to pay for and babysit.
 *
 * Deployed with `COOKIE_SIGNER=external` (see vercel.json). If that variable is missing the app
 * still runs, but write tools will report "no wallet configured" rather than silently doing
 * something else — which is the correct failure for a misconfiguration that would otherwise mean
 * the server was holding a key.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { handle, type HandlerRequest } from "../server/handler.ts";

const MAX_BODY = 1_000_000;

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export default async function mcpFunction(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "cookie-oven", transport: "POST /api/mcp" }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "POST only" }));
    return;
  }

  let body: HandlerRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as HandlerRequest;
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ ok: false, error: `Bad request body: ${e instanceof Error ? e.message : e}` }),
    );
    return;
  }

  const out = await handle(body);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(out));
}
