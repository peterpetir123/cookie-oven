/**
 * Small shared presentational pieces.
 *
 * Kept in one file because each is a handful of lines and they are always used together — splitting
 * them into six files would cost more in imports than it saves in clarity.
 */

import type { ReactNode } from "react";

export type Tone = "bad" | "warn" | "good" | "info";

const ICON: Record<Tone, string> = {
  bad: "✕",
  warn: "!",
  good: "✓",
  info: "i",
};

/**
 * A message with a tone. `hint` is for the actionable half — the RPC to check, the bridge to visit —
 * and is rendered dimmer so the primary message still reads first.
 */
export function Notice({
  tone,
  children,
  hint,
  action,
}: {
  tone: Tone;
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`}>
      <span className="icon">{ICON[tone]}</span>
      <div style={{ flex: 1 }}>
        <div>{children}</div>
        {hint ? <div className="hint">{hint}</div> : null}
        {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  small,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  small?: boolean;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${small ? " sm" : ""}${tone ? ` ${tone}` : ""}`}>{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export function Badge({
  tone = "low",
  children,
}: {
  tone?: "low" | "mid" | "high" | "bad" | "info";
  children: ReactNode;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/** A labelled progress bar. `pct` is clamped, so a pool that over-reports cannot break the layout. */
export function Progress({ pct, tone }: { pct: number; tone: "low" | "mid" | "high" }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className={`progress ${tone}`} role="progressbar" aria-valuenow={width}>
      <i style={{ width: `${width}%` }} />
    </div>
  );
}

export function Card({
  title,
  right,
  children,
  padded = true,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="card" style={padded ? undefined : { padding: 16 }}>
      {title || right ? (
        <div className="card-head">
          {title ? <div className="card-title">{title}</div> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Loading placeholder that reserves the same height, so panels do not jump when data lands. */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="empty">
      <span className="spinner" style={{ display: "inline-block", marginRight: 8 }} />
      {label}…
    </div>
  );
}
