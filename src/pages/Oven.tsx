/**
 * Oven — launch a token on the MomoSwap curve.
 *
 * This is the app's flagship action, and the one the bounty's "meaningful on-chain interaction"
 * line is really about: the user does not read chain state here, they create it. A new mint, a new
 * curve, a new pool — all of it appearing on Cookie Chain because someone clicked a button.
 *
 * It is also the one flow that cannot be a single call. The launchpad authenticates the creator
 * before it will build anything, and that authentication is an ed25519 signature over a login
 * string — a `signMessage`, not a `signTransaction`. So the flow is:
 *
 *   deploy_token                 -> { kind: "message", message: "..." }
 *   wallet.signMessage(message)  -> signature
 *   deploy_token + loginSignature -> { kind: "transaction", ... }
 *   wallet.signTransaction        -> submit
 *
 * The user sees one button. The two signatures are an implementation detail of the launchpad's
 * auth, and surfacing them as two steps would make the app look broken rather than careful.
 */

import { useState } from "react";

import { read, TOOL } from "../lib/mcp.js";
import { usePoll } from "../hooks/usePoll.js";
import { useTransaction } from "../hooks/useTransaction.js";
import { Card, Notice, Stat } from "../components/ui.js";
import { Stages, TxFailure, TxSuccess } from "../components/Stages.js";
import { amount } from "../lib/format.js";
import { runMessageLogin, TxError } from "../lib/tx.js";
import type { ConnectedWallet } from "../lib/wallet.js";
import type { LaunchpadPoolsResult, WalletBalances } from "../lib/types.js";

const POLL_MS = 20000;

/** Curve durations the launchpad accepts, in seconds. */
const DURATIONS = [
  { label: "1 day", secs: 86_400 },
  { label: "3 days", secs: 259_200 },
  { label: "7 days", secs: 604_800 },
  { label: "14 days", secs: 1_209_600 },
  { label: "30 days", secs: 2_592_000 },
];

export function OvenPage({ connection }: { connection: ConnectedWallet | null }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [durationSecs, setDurationSecs] = useState(DURATIONS[2].secs);
  const [expiryMode, setExpiryMode] = useState<"fair" | "jackpot">("fair");
  const [devBuyCook, setDevBuyCook] = useState("");
  const [phase, setPhase] = useState<"idle" | "login" | "launch">("idle");
  const [loginError, setLoginError] = useState<{ message: string; hint?: string } | null>(null);

  const tx = useTransaction();
  const balances = usePoll(
    () => (connection ? read<WalletBalances>(TOOL.balances, {}, { wallet: connection.address }) : Promise.resolve(null)),
    POLL_MS,
    [connection?.address],
    !!connection,
  );
  const recent = usePoll(
    () => read<LaunchpadPoolsResult>(TOOL.launchpadPools, { status: "all", limit: 50 }),
    POLL_MS,
  );

  if (!connection) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <Notice
          tone="info"
          hint="Launching a token is an on-chain action paid for by your wallet — a new mint, a new curve, a new pool."
        >
          Connect a wallet to use the Oven.
        </Notice>
        <Explainer />
      </div>
    );
  }

  const cookBalance = Number(balances.data?.cook.amount ?? 0);
  const devBuy = Number(devBuyCook || 0);
  const overspend = devBuy > 0 && devBuy > cookBalance;
  const valid = name.trim().length > 0 && symbol.trim().length > 0 && !overspend;
  const busy = phase !== "idle" || tx.running;

  const launch = async () => {
    setLoginError(null);
    const args: Record<string, unknown> = {
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      durationSecs,
      expiryMode,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
      ...(twitter.trim() ? { twitter: twitter.trim() } : {}),
      ...(telegram.trim() ? { telegram: telegram.trim() } : {}),
      ...(website.trim() ? { website: website.trim() } : {}),
      ...(devBuy > 0 ? { devBuyCook: devBuyCook } : {}),
      // The launchpad will not build a token without a logo decision, and an empty string is not a
      // decision. Saying so explicitly is what `noLogo` is for.
      ...(!imageUrl.trim() ? { noLogo: true } : {}),
    };

    // Phase 1 — the launchpad's login signature.
    setPhase("login");
    let loginSignature: { message: string; signature: string };
    try {
      loginSignature = await runMessageLogin(TOOL.deployToken, args, connection, () => {});
    } catch (e) {
      const err = e instanceof TxError ? e : null;
      setLoginError({
        message: err?.message ?? (e instanceof Error ? e.message : String(e)),
        hint: err?.hint,
      });
      setPhase("idle");
      return;
    }

    // Phase 2 — same call, now carrying the answer.
    setPhase("launch");
    const outcome = await tx.run(
      TOOL.deployToken,
      { ...args, loginSignature },
      connection,
    );
    setPhase("idle");
    if (outcome) {
      setName("");
      setSymbol("");
      setDescription("");
      setImageUrl("");
      setTwitter("");
      setTelegram("");
      setWebsite("");
      setDevBuyCook("");
      balances.refresh();
      recent.refresh();
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid cols-2">
        <Card title="New token">
          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Crumb"
                maxLength={32}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Symbol</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="CRUMB"
                maxLength={10}
                disabled={busy}
              />
            </label>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token for?"
              rows={2}
              maxLength={280}
              disabled={busy}
            />
          </label>

          <label className="field">
            <span>Logo URL</span>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…/logo.png"
              disabled={busy}
            />
            <small>Leave empty to launch without a logo.</small>
          </label>

          <div className="grid cols-3" style={{ gap: 10 }}>
            <label className="field">
              <span>Twitter</span>
              <input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@handle" disabled={busy} />
            </label>
            <label className="field">
              <span>Telegram</span>
              <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="t.me/…" disabled={busy} />
            </label>
            <label className="field">
              <span>Website</span>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" disabled={busy} />
            </label>
          </div>

          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">
              <span>Curve duration</span>
              <select value={durationSecs} onChange={(e) => setDurationSecs(Number(e.target.value))} disabled={busy}>
                {DURATIONS.map((d) => (
                  <option key={d.secs} value={d.secs}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>If it does not graduate</span>
              <select value={expiryMode} onChange={(e) => setExpiryMode(e.target.value as "fair" | "jackpot")} disabled={busy}>
                <option value="fair">Refund holders pro-rata (fair)</option>
                <option value="jackpot">Settlement payout (jackpot)</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>Your dev buy (optional)</span>
            <input
              value={devBuyCook}
              onChange={(e) => setDevBuyCook(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.0"
              inputMode="decimal"
              disabled={busy}
            />
            <small>COOK you buy at launch. Balance {amount(balances.data?.cook.amount ?? 0)} COOK.</small>
          </label>

          {overspend ? (
            <Notice tone="warn" hint="Lower the dev buy, or bridge more COOK in.">
              The dev buy is larger than this wallet's COOK balance.
            </Notice>
          ) : null}

          {loginError ? (
            <div style={{ marginTop: 12 }}>
              <TxFailure
                message={loginError.message}
                hint={loginError.hint}
                onDismiss={() => setLoginError(null)}
                onRetry={() => void launch()}
              />
            </div>
          ) : null}

          {tx.stages.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <Stages stages={tx.stages} />
            </div>
          ) : null}

          {tx.error ? (
            <div style={{ marginTop: 12 }}>
              <TxFailure
                message={tx.error.message}
                hint={tx.error.hint}
                onDismiss={tx.reset}
                onRetry={() => void launch()}
              />
            </div>
          ) : null}

          {tx.result ? (
            <div style={{ marginTop: 12 }}>
              <TxSuccess outcome={tx.result} onDismiss={tx.reset} />
            </div>
          ) : null}

          <button
            className="primary"
            style={{ width: "100%", marginTop: 12 }}
            disabled={!valid || busy}
            onClick={() => void launch()}
          >
            {phase === "login"
              ? "Waiting for the login signature…"
              : phase === "launch"
                ? "Building the launch…"
                : "Bake this token"}
          </button>

          <div className="small faint" style={{ marginTop: 10 }}>
            Two signatures are needed: one to log in to the launchpad, one for the launch itself.
          </div>
        </Card>

        <div className="stack" style={{ gap: 12 }}>
          <Card title="What happens">
            <ol className="small dim" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>A new SPL mint is created on Cookie Chain.</li>
              <li>A bonding curve opens with your token against COOK.</li>
              <li>Buyers trade on the curve; the price moves with each fill.</li>
              <li>
                If it reaches the graduation target it migrates to a real pool and holders get SPL
                tokens. If it expires first, {expiryMode === "fair" ? "holders are refunded" : "the settlement root pays out"}.
              </li>
            </ol>
            <div className="small faint" style={{ marginTop: 12 }}>
              Deploying on Cookie Chain costs a fraction of a cent, which is the whole reason this
              app can let you experiment without thinking about it.
            </div>
          </Card>

          {recent.data && recent.data.pools.length > 0 ? (
            <Card title="Just launched">
              <div className="stack" style={{ gap: 8 }}>
                {recent.data.pools.slice(0, 6).map((p) => (
                  <div key={p.pool} className="row" style={{ justifyContent: "space-between" }}>
                    <span className="small strong">{p.symbol}</span>
                    <span className="small faint">{p.participants} holders</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Explainer() {
  return (
    <Card title="The Oven">
      <div className="grid cols-3">
        <Stat label="Deploy cost" value="~$0.05" small sub="a program, on Cookie Chain" />
        <Stat label="Curve" value="MomoSwap" small sub="bonding curve launchpad" />
        <Stat label="Token standard" value="SPL" small sub="works with Solana tooling" />
      </div>
      <div className="small faint" style={{ marginTop: 14 }}>
        Cookie Chain is an independent SVM network: SPL tokens, Anchor programs and Solana tooling
        work unchanged, blocks land in about a second, and a deployment costs cents. That is what
        makes a one-click launchpad possible at all.
      </div>
    </Card>
  );
}
