/**
 * Contamination canary scan. Every public development case carries a canary
 * token; any holdout trajectory that reproduces one verbatim is flagged as
 * contaminated. Also used for the documented token-overlap check: scan model
 * outputs and the holdout corpus for public development canaries.
 */
export function findCanaryMatches(text: string, canaries: string[]): string[] {
  return canaries.filter((canary) => text.includes(canary));
}

/** Reports whether any canary appears, with which ones. */
export function contaminationReport(text: string, canaries: string[]): {
  contaminated: boolean;
  matched: string[];
} {
  const matched = findCanaryMatches(text, canaries);
  return { contaminated: matched.length > 0, matched };
}