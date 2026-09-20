/**
 * Display formatting.
 *
 * Cookie Chain numbers are extreme in both directions — COOK trades around $0.00008 and a launch
 * supply is 1e15 — so the defaults here are chosen for that range rather than for the usual
 * dollar-amounts case. Anything that would render as `0` when it is not zero gets a `<` prefix
 * instead, because "0" on a balance reads as "you have nothing" and is the one wrong answer a user
 * will act on.
 */

export function compact(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** A token amount. Trailing zeros trimmed, tiny values not flattened to zero. */
export function amount(n: number | string | null | undefined, digits = 4): string {
  if (n === null || n === undefined) return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs < 1e-6) return v.toExponential(2);
  if (abs < 0.01) return trim(v.toFixed(8));
  if (abs < 1000) return trim(v.toFixed(digits));
  return compact(v, 2);
}

/**
 * A USD figure. Below a cent this switches to significant digits rather than fixed ones, because
 * `$0.00` for a real price is indistinguishable from free.
 */
export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "$0";
  if (abs < 0.01) {
    const s = n.toPrecision(3);
    return `$${Number(s).toString()}`;
  }
  if (abs < 1000) return `$${n.toFixed(2)}`;
  return `$${compact(n, 2)}`;
}

/** A price in COOK, which is the unit launch curves are actually denominated in. */
export function cook(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${amount(v)} COOK`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function shortAddr(s: string | null | undefined, head = 4, tail = 4): string {
  if (!s) return "—";
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** "in 3h", "2d ago" — deliberately coarse; a launch countdown does not need seconds. */
export function relativeTime(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined) return "—";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const unit =
    abs < 60_000
      ? ["s", 1000]
      : abs < 3_600_000
        ? ["m", 60_000]
        : abs < 86_400_000
          ? ["h", 3_600_000]
          : ["d", 86_400_000];
  const value = Math.round(abs / (unit[1] as number));
  return diff >= 0 ? `in ${value}${unit[0]}` : `${value}${unit[0]} ago`;
}

/** Strip trailing zeros so `1.5000` reads as `1.5` and `1.0000` as `1`. */
function trim(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * Colour intent for a pool's progress.
 *
 * Not purely decorative: a curve that is close to graduating behaves differently from one that is
 * not (the sell side dries up as it fills), so the colour is a signal about what the user should
 * expect, not a mood.
 */
export function progressTone(p: number): "low" | "mid" | "high" {
  if (p >= 75) return "high";
  if (p >= 30) return "mid";
  return "low";
}
