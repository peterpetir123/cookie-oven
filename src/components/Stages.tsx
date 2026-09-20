/**
 * The visible half of the transaction pipeline.
 *
 * Showing all six stages rather than a single spinner is a deliberate choice: a wallet signature
 * can take as long as the user takes, and a bare spinner during that window is indistinguishable
 * from a hang. Naming the stage tells them the app is waiting on *them*, not on the network.
 *
 * Failed stages stay on screen with their message, so the user can see how far it got — which is
 * the difference between "it didn't work" and "it built and simulated fine, then you declined".
 */

import { STAGE_LABEL, type Stage } from "../lib/tx.js";
import type { StageState } from "../hooks/useTransaction.js";
import type { TxOutcome } from "../lib/tx.js";

export function Stages({ stages }: { stages: StageState[] }) {
  if (stages.length === 0) return null;
  return (
    <ul className="stages">
      {stages.map((s) => (
        <li key={s.stage} className={s.status}>
          <span className="stage-mark">
            {s.status === "active" ? (
              <span className="spinner" />
            ) : s.status === "done" ? (
              "✓"
            ) : s.status === "failed" ? (
              "✕"
            ) : (
              "·"
            )}
          </span>
          <span>
            {STAGE_LABEL[s.stage as Stage]}
            {s.detail ? <span className="faint"> — {s.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The success panel. Links to the explorer, because a hash the user cannot check is just a claim. */
export function TxSuccess({
  outcome,
  onDismiss,
  extra,
}: {
  outcome: TxOutcome;
  onDismiss: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="notice good" style={{ display: "block" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="strong">Confirmed on Cookie Chain</span>
        <button className="ghost tiny" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <div className="mono tiny" style={{ marginTop: 6, wordBreak: "break-all" }}>
        {outcome.signature}
      </div>
      {outcome.warning ? (
        <div className="hint" style={{ marginTop: 6 }}>
          {outcome.warning}
        </div>
      ) : null}
      {extra ? <div style={{ marginTop: 10 }}>{extra}</div> : null}
      <div style={{ marginTop: 10 }}>
        <a href={outcome.explorerUrl} target="_blank" rel="noreferrer" className="btn tiny">
          View on Cookiescan ↗
        </a>
      </div>
    </div>
  );
}

/** The failure panel. Keeps the hint, which is usually the actual fix. */
export function TxFailure({
  message,
  hint,
  onDismiss,
  onRetry,
}: {
  message: string;
  hint?: string;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="notice bad" style={{ display: "block" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="strong">That didn't go through</span>
        <button className="ghost tiny" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <div style={{ marginTop: 6 }}>{message}</div>
      {hint ? <div className="hint">{hint}</div> : null}
      {onRetry ? (
        <div style={{ marginTop: 10 }}>
          <button className="tiny" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
