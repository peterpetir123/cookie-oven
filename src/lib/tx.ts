/**
 * The transaction pipeline.
 *
 * Every write in this app goes through `runTransaction`, so every action reports progress the same
 * way and fails the same way. Six stages, each with a name the user can read:
 *
 *   1. prepare   — the backend builds, verifies and simulates the transaction
 *   2. guard     — we confirm the RPC really is Cookie Chain before anything is signed
 *   3. sign      — the wallet signs; it never broadcasts
 *   4. submit    — we send the signed bytes over rpc.cookiescan.io
 *   5. confirm   — wait for the chain to accept it
 *   6. done      — link to the explorer
 *
 * Two decisions worth stating, because both are departures from the obvious implementation:
 *
 * **The wallet does not broadcast.** Most wallet adapters offer `signAndSendTransaction`, and on a
 * custom SVM chain it is a trap: the wallet broadcasts through its own configured RPC, which for a
 * browser wallet is Solana mainnet. The transaction is valid and the signature is real, so nothing
 * errors — it simply never confirms, and the user is left with a pending transaction that will
 * never land. We call `signTransaction` only and broadcast ourselves.
 *
 * **The guard runs after prepare, not before.** Preparing is the expensive step and the one that
 * touches the network; if the RPC is wrong we want to know before the user is looking at a wallet
 * popup, but we do not want to pay for a genesis check on every read. Running it between build and
 * sign puts it exactly where a wrong chain is still cheap to catch.
 */

import { assertCookieChain, explorerTx } from "./chain.js";
import { call, prepare, TOOL, type NeedsSignature, type NeedsSignatureTx } from "./mcp.js";
import { signMessageBytes, signTransactionBytes, type ConnectedWallet } from "./wallet.js";
import bs58 from "bs58";

export type Stage = "prepare" | "guard" | "sign" | "submit" | "confirm" | "done";

export const STAGE_LABEL: Record<Stage, string> = {
  prepare: "Building and simulating",
  guard: "Checking the chain",
  sign: "Waiting for your wallet",
  submit: "Sending to Cookie Chain",
  confirm: "Confirming",
  done: "Confirmed",
};

export interface TxProgress {
  stage: Stage;
  /** Anything the current stage wants to say. Already user-facing. */
  detail?: string;
}

export interface TxOutcome {
  signature: string;
  explorerUrl: string;
  /** What the backend said the transaction was for, echoed from `needs_signature`. */
  what: string;
  summary?: Record<string, unknown>;
  warning?: string;
}

/** A pipeline failure with the stage it died in, so the UI can point at the right row. */
export class TxError extends Error {
  readonly stage: Stage;
  readonly hint?: string;
  constructor(stage: Stage, message: string, hint?: string) {
    super(message);
    this.name = "TxError";
    this.stage = stage;
    this.hint = hint;
  }
}

export interface RunOptions {
  /** Tool that produces the transaction. */
  tool: string;
  args: unknown;
  /** The connected wallet. Required — this pipeline is only for things that move funds. */
  connection: ConnectedWallet;
  onProgress?: (p: TxProgress) => void;
  /**
   * Signatures collected earlier in the same logical action, for flows that need two rounds
   * (`deploy_token` logs in with a message before it can build anything).
   */
  providedSignatures?: { message: string; signature: string }[];
}

export async function runTransaction(opts: RunOptions): Promise<TxOutcome> {
  const { tool, args, connection, onProgress, providedSignatures } = opts;
  const report = (stage: Stage, detail?: string) => onProgress?.({ stage, detail });

  // ---- 1. prepare ---------------------------------------------------------
  report("prepare");
  let prepared: NeedsSignature;
  try {
    prepared = await prepare(tool, args, {
      wallet: connection.address,
      providedSignatures,
    });
  } catch (e) {
    throw new TxError("prepare", messageOf(e), hintOf(e));
  }

  // A message-signature step is a different flow: there is nothing to broadcast, and the caller has
  // to come back with the signature. Handled by `runMessageLogin` rather than forced through here.
  if (prepared.kind === "message") {
    throw new TxError(
      "prepare",
      `"${tool}" needs a message signature before it can build a transaction.`,
      "This step is handled by runMessageLogin().",
    );
  }

  const tx = prepared as NeedsSignatureTx;
  report("prepare", describe(tx));

  // ---- 2. guard -----------------------------------------------------------
  report("guard");
  const guard = await assertCookieChain();
  if (!guard.ok) throw new TxError("guard", guard.reason ?? "Chain check failed.");

  // ---- 3. sign ------------------------------------------------------------
  report("sign", "Approve in your wallet");
  let signedBytes: Uint8Array;
  try {
    signedBytes = await signTransactionBytes(
      connection.wallet,
      connection.account,
      bs58.decode(tx.transactionBase64),
    );
  } catch (e) {
    throw new TxError("sign", walletMessage(e), "You can retry — nothing was sent.");
  }

  // ---- 4. submit ----------------------------------------------------------
  report("submit");
  let submitted: { signature: string; explorerUrl?: string; warning?: string };
  try {
    const res = await call<{ signature: string; explorerUrl: string; warning?: string }>(
      TOOL.submitSigned,
      {
        signedTransactionBase64: bs58.encode(signedBytes),
        submit: tx.submit,
        blockhash: tx.blockhash,
        lastValidBlockHeight: tx.lastValidBlockHeight,
        what: tx.what,
      },
      { wallet: connection.address },
    );
    if (!res.result?.signature) {
      throw new Error("The backend accepted the transaction but returned no signature.");
    }
    submitted = res.result;
  } catch (e) {
    throw new TxError("submit", messageOf(e), hintOf(e));
  }

  // ---- 5/6. confirm -------------------------------------------------------
  // `submit_signed_tx` already confirms before returning, so reaching here means the chain took it.
  report("confirm", submitted.signature);
  const explorerUrl = submitted.explorerUrl ?? explorerTx(submitted.signature);
  report("done", explorerUrl);

  return {
    signature: submitted.signature,
    explorerUrl,
    what: tx.what,
    summary: tx.summary,
    warning: submitted.warning,
  };
}

/**
 * Flows that start with a message signature rather than a transaction.
 *
 * `deploy_token` is the one that matters: the MomoSwap launchpad authenticates the creator with an
 * ed25519 signature over a login string before it will build the launch. That is a `signMessage`,
 * not a `signTransaction`, so it cannot ride the pipeline above — but it is the same idea, and the
 * caller gets the same progress reporting.
 */
export async function runMessageLogin(
  tool: string,
  args: unknown,
  connection: ConnectedWallet,
  onProgress?: (p: TxProgress) => void,
): Promise<{ message: string; signature: string }> {
  onProgress?.({ stage: "prepare" });
  let prepared: NeedsSignature;
  try {
    prepared = await prepare(tool, args, { wallet: connection.address });
  } catch (e) {
    throw new TxError("prepare", messageOf(e), hintOf(e));
  }

  if (prepared.kind !== "message") {
    throw new TxError(
      "prepare",
      `"${tool}" returned a transaction where a login message was expected.`,
    );
  }

  onProgress?.({ stage: "sign", detail: "Sign the launchpad login" });
  let signature: string;
  try {
    const bytes = await signMessageBytes(
      connection.wallet,
      connection.account,
      new TextEncoder().encode(prepared.message),
    );
    signature = bs58.encode(bytes);
  } catch (e) {
    throw new TxError("sign", walletMessage(e));
  }

  return { message: prepared.message, signature };
}

/** Human summary of what the backend says a transaction will do. */
function describe(tx: NeedsSignatureTx): string {
  const s = tx.summary ?? {};
  const parts: string[] = [];
  for (const [k, v] of Object.entries(s)) {
    if (v === null || v === undefined || typeof v === "object") continue;
    parts.push(`${k}: ${String(v)}`);
  }
  return parts.length ? parts.join(" · ") : tx.what;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function hintOf(e: unknown): string | undefined {
  const h = (e as { hint?: unknown })?.hint;
  return typeof h === "string" ? h : undefined;
}

/**
 * Wallet errors arrive as whatever the extension felt like throwing. These are the ones users hit
 * and the ones worth translating; anything else keeps its original wording rather than being
 * replaced by a guess.
 */
function walletMessage(e: unknown): string {
  const raw = messageOf(e);
  if (/user rejected|user denied|rejected the request|declined/i.test(raw)) {
    return "You declined the signature. Nothing was sent.";
  }
  if (/not connected|disconnected/i.test(raw)) {
    return "The wallet disconnected before signing. Reconnect and try again.";
  }
  if (/blockhash/i.test(raw)) {
    return "The transaction expired before it was signed. Try again — a fresh one takes a second.";
  }
  return raw;
}
