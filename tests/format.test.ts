/**
 * Tests for the number formatting.
 *
 * These earn their place because the formatting is not cosmetic: Cookie Chain's numbers span from
 * ~$0.00008 for COOK to 1e15 for a launch supply, and the failure mode of getting this wrong is a
 * user reading "0" for a balance they actually hold.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { amount, compact, cook, pct, progressTone, relativeTime, shortAddr, usd } from "../src/lib/format.ts";

test("amount does not flatten a small non-zero balance to zero", () => {
  assert.notEqual(amount(0.0000001), "0");
  assert.equal(amount(0), "0");
  assert.equal(amount(null), "—");
  assert.equal(amount(undefined), "—");
});

test("amount trims trailing zeros but keeps precision below 0.01", () => {
  assert.equal(amount(1.5), "1.5");
  assert.equal(amount(1), "1");
  assert.equal(amount(0.001234), "0.001234");
});

test("compact switches units at the expected thresholds", () => {
  assert.equal(compact(999), "999");
  assert.equal(compact(1_000), "1.00K");
  assert.equal(compact(1_500_000), "1.50M");
  assert.equal(compact(2_000_000_000), "2.00B");
  assert.equal(compact(3e15), "3000.00T");
});

test("usd keeps sub-cent prices distinguishable from free", () => {
  assert.equal(usd(0), "$0");
  assert.notEqual(usd(0.000078), "$0.00");
  assert.equal(usd(12.3456), "$12.35");
  assert.equal(usd(null), "—");
});

test("cook appends the unit", () => {
  assert.equal(cook("1234.5"), "1.23K COOK");
  assert.equal(cook(null), "—");
});

test("pct formats to one decimal by default", () => {
  assert.equal(pct(26.9672), "27.0%");
  assert.equal(pct(0), "0.0%");
  assert.equal(pct(null), "—");
});

test("shortAddr never claims an address is longer than it is", () => {
  assert.equal(shortAddr("abcdefghijklmnop"), "abcd…mnop");
  assert.equal(shortAddr("abc"), "abc");
  assert.equal(shortAddr(null), "—");
});

test("progressTone is monotonic across its boundaries", () => {
  assert.equal(progressTone(0), "low");
  assert.equal(progressTone(29.9), "low");
  assert.equal(progressTone(30), "mid");
  assert.equal(progressTone(74.9), "mid");
  assert.equal(progressTone(75), "high");
  assert.equal(progressTone(100), "high");
});

test("relativeTime reads a countdown as future and a past date as past", () => {
  const inTwoHours = new Date(Date.now() + 2 * 3_600_000).toISOString();
  assert.match(relativeTime(inTwoHours), /^in 2h$/);

  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  assert.match(relativeTime(threeDaysAgo), /^3d ago$/);

  assert.equal(relativeTime(null), "—");
  assert.equal(relativeTime("not a date"), "—");
});
