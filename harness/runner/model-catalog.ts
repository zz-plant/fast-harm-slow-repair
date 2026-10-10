/**
 * Model version pinning. Workers AI catalog ids like `@cf/meta/llama-4-scout…`
 * track the latest version; the protocol promises pinned, hashed models (§7),
 * so the pilot resolves each model name to the catalog's version id and
 * records it in every trajectory. Resolution is best-effort — a failed lookup
 * records `null` rather than failing the run.
 */
export async function resolveModelVersionIds(
  config: { accountId: string; apiToken: string; fetchImpl?: typeof fetch },
  modelNames: string[]
): Promise<Map<string, string | null>> {
  const doFetch = config.fetchImpl ?? fetch;
  const result = new Map<string, string | null>();
  for (const name of modelNames) {
    try {
      const url =
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/models/search` +
        `?search=${encodeURIComponent(name)}`;
      const response = await doFetch(url, {
        headers: { Authorization: `Bearer ${config.apiToken}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        result.set(name, null);
        continue;
      }
      const payload: any = await response.json();
      const entries = payload?.result ?? [];
      const entry = Array.isArray(entries)
        ? entries.find((model: any) => model?.name === name)
        : undefined;
      result.set(name, typeof entry?.id === "string" ? entry.id : null);
    } catch {
      result.set(name, null);
    }
  }
  return result;
}