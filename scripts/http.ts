import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Source } from "../shared/schema";
type Options = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  resolve?: (host: string) => Promise<string[]>;
};
export class CollectionError extends Error {}
export function publicAddress(ip: string): boolean {
  if (ip.includes(":"))
    return (
      !/^(::|::1$|f[cd]|fe[89ab]|ff|2001:db8)/i.test(ip) && !ip.includes(".")
    );
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  return (
    parts.length === 4 &&
    !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    )
  );
}
export class HttpClient {
  private lastRequest = 0;
  private requests = 0;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly resolve: (host: string) => Promise<string[]>;
  constructor(
    private source: Source,
    private hosts: string[],
    options: Options = {},
  ) {
    this.fetcher = options.fetch ?? fetch;
    this.sleep =
      options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.resolve =
      options.resolve ??
      (async (host) =>
        (await lookup(host, { all: true })).map((r) => r.address));
  }
  async get(url: string, format: "json" | "text" = "json"): Promise<unknown> {
    const p = this.source.requestPolicy;
    for (let attempt = 0; attempt < 3; attempt++) {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.port ||
        !this.hosts.includes(u.hostname) ||
        u.hostname === "localhost" ||
        isIP(u.hostname)
      )
        throw new CollectionError("Destination rejected by source policy");
      const addresses = await this.resolve(u.hostname);
      if (!addresses.length || addresses.some((a) => !publicAddress(a)))
        throw new CollectionError("Nonpublic destination rejected");
      if (++this.requests > p.maxPages * 3 + 3)
        throw new CollectionError("Request budget exhausted");
      await this.sleep(
        Math.max(0, p.minDelayMs - (Date.now() - this.lastRequest)),
      );
      this.lastRequest = Date.now();
      let response: Response;
      try {
        response = await this.fetcher(u, {
          signal: AbortSignal.timeout(p.timeoutMs),
          redirect: "manual",
          headers: {
            Accept:
              format === "json"
                ? "application/json"
                : "text/html, application/xml, application/rss+xml, text/xml",
            "User-Agent": "JobScout/1.0 (approved employer-board collection)",
          },
        });
      } catch {
        throw new CollectionError("Request timed out or network unavailable");
      }
      if (response.status === 429 || response.status >= 500) {
        const retry = response.headers.get("retry-after");
        const delay = retry
          ? /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : Date.parse(retry) - Date.now()
          : 1000 * 2 ** attempt;
        await response.body?.cancel();
        if (attempt === 2 || !Number.isFinite(delay) || delay > 30000)
          throw new CollectionError(
            `Provider HTTP ${response.status}; retry budget exhausted`,
          );
        await this.sleep(Math.max(0, delay));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new CollectionError(
          response.status >= 300 && response.status < 400
            ? "Redirect requires source review"
            : `Provider HTTP ${response.status}`,
        );
      }
      if (Number(response.headers.get("content-length")) > p.maxResponseBytes) {
        await response.body?.cancel();
        throw new CollectionError("Response exceeds byte limit");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new CollectionError("Empty response body");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > p.maxResponseBytes) {
            await reader.cancel();
            throw new CollectionError("Response exceeds byte limit");
          }
          chunks.push(part.value);
        }
      } catch {
        throw new CollectionError("Response interrupted or exceeds byte limit");
      }
      const value = new TextDecoder().decode(Buffer.concat(chunks));
      if (
        /captcha|cf-chl-|verify you are human|access denied|sign in to continue/i.test(
          value,
        )
      )
        throw new CollectionError("Access challenge; collection stopped");
      if (format === "text") return value;
      if (
        !/json/i.test(response.headers.get("content-type") ?? "") ||
        /^\s*</.test(value)
      )
        throw new CollectionError("Expected JSON; received non-JSON content");
      try {
        return JSON.parse(value);
      } catch {
        throw new CollectionError("Invalid JSON response");
      }
    }
    throw new CollectionError("Request budget exhausted");
  }
}
