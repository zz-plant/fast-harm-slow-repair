import { describe, expect, test } from "bun:test";
import {
  Z95,
  binomialPmf,
  discordantPairsRejectionThreshold,
  mcnemarExactP,
  pairedTestPower,
  perfectRunWilsonLower,
  minNForPerfectLowerBound,
  wilsonInterval,
} from "../analysis/stats.ts";

// These tests pin the numbers quoted in protocol.md and preregistration.json.
// If a quoted figure changes, change it by recomputing, not by editing prose.

describe("computed statistics pinned in the protocol", () => {
  test("perfect 36/36 run: Wilson 95% lower bound is 0.9036", () => {
    expect(perfectRunWilsonLower(36)).toBeCloseTo(0.9036, 4);
    expect(wilsonInterval(36, 36).lower).toBeCloseTo(0.9036, 4);
    expect(wilsonInterval(36, 36).upper).toBe(1);
  });

  test("0/36 run: Wilson upper bound is 0.0964 (about 9.6%)", () => {
    expect(wilsonInterval(0, 36).upper).toBeCloseTo(0.0964, 4);
    expect(wilsonInterval(0, 36).lower).toBe(0);
  });

  test("establishing at least 95% with 95% confidence requires 73 cases", () => {
    expect(minNForPerfectLowerBound(0.95)).toBe(73);
    expect(perfectRunWilsonLower(72)).toBeLessThan(0.95);
    expect(perfectRunWilsonLower(73)).toBeGreaterThanOrEqual(0.95);
  });

  test("binomial pmf is exact at the boundary", () => {
    expect(binomialPmf(9, 9, 0.5)).toBeCloseTo(1 / 512, 12);
    expect(binomialPmf(9, 0, 0)).toBe(1);
    expect(binomialPmf(9, 5, 1)).toBe(0);
  });

  test("exact McNemar rejection region: 6 all-one-direction pairs suffice", () => {
    expect(discordantPairsRejectionThreshold(0.05)).toBe(6);
    expect(mcnemarExactP(6, 0)).toBeCloseTo(0.03125, 6);
    expect(mcnemarExactP(5, 0)).toBeGreaterThan(0.05);
    // Asymmetry matters: 7-vs-1 is not significant, 8-vs-1 is.
    expect(mcnemarExactP(7, 1)).toBeGreaterThan(0.05);
    expect(mcnemarExactP(8, 1)).toBeLessThan(0.05);
  });

  test("paired power profile over 36 cases (all discordant pairs favoring treatment)", () => {
    expect(pairedTestPower(36, 0.15, 1)).toBeCloseTo(0.459, 2);
    expect(pairedTestPower(36, 0.215, 1)).toBeCloseTo(0.817, 2);
    expect(pairedTestPower(36, 0.25, 1)).toBeCloseTo(0.917, 2);
  });

  test("power is fragile to direction consistency — the reason small effects are 'unresolved'", () => {
    // Same 25-point discordance, but if only 90% (80%) of the discordant
    // pairs favor the treatment, power collapses.
    expect(pairedTestPower(36, 0.25, 0.9)).toBeCloseTo(0.607, 2);
    expect(pairedTestPower(36, 0.25, 0.8)).toBeCloseTo(0.315, 2);
  });

  test("Z95 is the exact 97.5% normal quantile", () => {
    expect(Z95).toBeCloseTo(1.959963984540054, 12);
  });
});
