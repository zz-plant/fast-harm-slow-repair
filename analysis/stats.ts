/**
 * Statistics used by the protocol, computed rather than asserted.
 *
 * The prose in protocol.md and preregistration.json quotes several numbers
 * (Wilson bounds, required sample size, paired-test power). They are derived
 * here and pinned by tests so the documents cannot drift from the mathematics.
 * The module is deliberately dependency-free: exact enumeration, no simulation
 * randomness, reproducible by hand.
 */

/** Two-sided 95% normal quantile. */
export const Z95 = 1.959963984540054;

const logFactorialCache: number[] = [0, 0];

function logFactorial(n: number): number {
  for (let i = logFactorialCache.length; i <= n; i += 1) {
    logFactorialCache[i] = logFactorialCache[i - 1]! + Math.log(i);
  }
  return logFactorialCache[n]!;
}

export function binomialPmf(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  const logP =
    logFactorial(n) - logFactorial(k) - logFactorial(n - k) +
    k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logP);
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(
  successes: number,
  n: number,
  z: number = Z95
): { lower: number; upper: number } {
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

/**
 * Wilson lower bound for a perfect run (k = n). With phat = 1 the interval
 * collapses to the closed form 1 / (1 + z^2 / n).
 */
export function perfectRunWilsonLower(n: number, z: number = Z95): number {
  return 1 / (1 + (z * z) / n);
}

/** Smallest n whose perfect-run Wilson lower bound reaches the target. */
export function minNForPerfectLowerBound(target: number, z: number = Z95): number {
  const analytic = Math.ceil((z * z * target) / (1 - target));
  let n = analytic;
  while (perfectRunWilsonLower(n, z) < target) n += 1;
  return n;
}

/**
 * Two-sided exact McNemar p-value for b pairs favoring treatment and c favoring
 * control among d = b + c discordant pairs. Under the null, conditional on d,
 * the count is Binomial(d, 0.5); the p-value doubles the upper tail.
 */
export function mcnemarExactP(b: number, c: number): number {
  const d = b + c;
  if (d === 0) return 1;
  let tail = 0;
  for (let k = Math.max(b, c); k <= d; k += 1) tail += binomialPmf(d, k, 0.5);
  return Math.min(1, 2 * tail);
}

/**
 * Smallest all-one-direction discordant count d whose exact two-sided p-value
 * reaches significance: reject iff 2^(1-d) <= alpha.
 */
export function discordantPairsRejectionThreshold(alpha = 0.05): number {
  return Math.ceil(1 - Math.log2(alpha));
}

/**
 * Exact power of the paired sign test (exact McNemar) over n cases, where each
 * case favors the treatment with probability rho*q, the control with
 * probability rho*(1-q), and is concordant with probability 1-rho. Computed by
 * enumerating the trinomial distribution over (favor-treatment, favor-control)
 * counts — no simulation, no randomness.
 */
export function pairedTestPower(n: number, rho: number, q: number, alpha = 0.05): number {
  const pC = rho * q;
  const pB = rho * (1 - q);
  const pSame = 1 - rho;
  let power = 0;
  for (let b = 0; b <= n; b += 1) {
    for (let c = 0; c + b <= n; c += 1) {
      const same = n - b - c;
      if ((b > 0 && pC <= 0) || (c > 0 && pB <= 0) || (same > 0 && pSame <= 0)) continue;
      let logProb =
        logFactorial(n) - logFactorial(b) - logFactorial(c) - logFactorial(same);
      if (b > 0) logProb += b * Math.log(pC);
      if (c > 0) logProb += c * Math.log(pB);
      if (same > 0) logProb += same * Math.log(pSame);
      if (mcnemarExactP(b, c) <= alpha) power += Math.exp(logProb);
    }
  }
  return power;
}

/**
 * Smallest discordance rate (all discordant pairs favoring the treatment, the
 * most favorable alternative) whose paired test power reaches the target. The
 * detectable difference in marginal proportions equals this rate.
 */
export function minimumDetectableDifference(
  n: number,
  targetPower = 0.8,
  alpha = 0.05
): { rho: number; pairs: number; power: number } {
  for (let rho = 0.01; rho <= 0.5 + 1e-9; rho += 0.005) {
    const power = pairedTestPower(n, rho, 1, alpha);
    if (power >= targetPower) {
      return { rho: Number(rho.toFixed(3)), pairs: Math.round(rho * n), power };
    }
  }
  throw new Error(`No discordance rate up to 50% reaches power ${targetPower} for n=${n}`);
}
