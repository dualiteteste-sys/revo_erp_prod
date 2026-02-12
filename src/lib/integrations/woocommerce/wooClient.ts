export type WooAuthMode = "basic_https" | "oauth1" | "querystring_fallback";

export type WooClientOptions = {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  authMode?: WooAuthMode;
  timeoutMs?: number;
  maxAttempts?: number;
};

export class WooClient {
  private readonly baseUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly authMode: WooAuthMode;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(opts: WooClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.consumerKey = opts.consumerKey;
    this.consumerSecret = opts.consumerSecret;
    this.authMode = opts.authMode ?? "basic_https";
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  private build(path: string, query?: Record<string, string>) {
    const u = new URL(`${this.baseUrl}/wp-json/wc/v3/${path.replace(/^\/+/, "")}`);
    for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);

    const headers: Record<string, string> = { Accept: "application/json" };
    const ck = this.consumerKey.trim();
    const cs = this.consumerSecret.trim();

    if (this.authMode === "basic_https") {
      headers.Authorization = `Basic ${btoa(`${ck}:${cs}`)}`;
    } else if (this.authMode === "querystring_fallback") {
      u.searchParams.set("consumer_key", ck);
      u.searchParams.set("consumer_secret", cs);
    } else {
      headers.Authorization = `Basic ${btoa(`${ck}:${cs}`)}`;
    }
    return { url: u.toString(), headers };
  }

  private async request(path: string, init?: RequestInit, query?: Record<string, string>) {
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const { url, headers } = this.build(path, query);
        const resp = await fetch(url, {
          ...(init ?? {}),
          signal: controller.signal,
          headers: { ...headers, ...(init?.headers ?? {}) },
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) return { ok: true as const, status: resp.status, data };
        if (resp.status === 429 || resp.status >= 500) throw new Error(`HTTP_${resp.status}`);
        return { ok: false as const, status: resp.status, data };
      } catch (e: unknown) {
        lastErr = e;
        if (attempt >= this.maxAttempts) throw e;
        const wait = Math.min(10_000, 300 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
        await new Promise((r) => setTimeout(r, wait));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("REQUEST_FAILED");
  }

  async get<T = unknown>(path: string, query?: Record<string, string>) {
    return await this.request(path, { method: "GET" }, query) as { ok: boolean; status: number; data: T };
  }

  async post<T = unknown>(path: string, body: unknown, query?: Record<string, string>) {
    return await this.request(
      path,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      query,
    ) as { ok: boolean; status: number; data: T };
  }

  async *paginate<T = unknown>(path: string, query: Record<string, string> = {}) {
    const perPage = Number(query.per_page ?? 100) || 100;
    let page = Number(query.page ?? 1) || 1;
    // hard stop to avoid loops with buggy stores/proxies
    for (let i = 0; i < 10_000; i++) {
      const resp = await this.get<T[]>(path, { ...query, per_page: String(perPage), page: String(page) });
      if (!resp.ok) throw new Error(`PAGINATION_FAILED:${resp.status}`);
      const items = Array.isArray(resp.data) ? resp.data : [];
      if (items.length === 0) return;
      for (const it of items) yield it;
      if (items.length < perPage) return;
      page += 1;
    }
    throw new Error("PAGINATION_LOOP_GUARD");
  }
}
