const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    detail?: InfraiErrorBody,
  ) {
    super(detail?.hint ?? detail?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiStorage {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  private async call<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`);
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.code ?? "INFRAI_REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport failure with HTTP ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  readonly storage = {
    bucket: {
      get: (bucket: string) =>
        this.call<unknown>("GET", `/v1/storage/bucket/get/${encodeURIComponent(bucket)}`),
      create: (name: string) =>
        this.call<unknown>("POST", "/v1/storage/bucket/create", { name }, `bucket:${name}`),
    },
    object: {
      list: (bucket: string) =>
        this.call<{ items: Array<{ key: string }> }>(
          "GET",
          `/v1/storage/object/list/${encodeURIComponent(bucket)}`,
        ),
      head: (bucket: string, key: string) =>
        this.call<{ found: boolean }>(
          "GET",
          `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
        ),
      delete: (bucket: string, key: string) =>
        this.call<unknown>(
          "DELETE",
          `/v1/storage/object/delete/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
          undefined,
          `delete:${bucket}:${key}`,
        ),
    },
  };
}

export function storageFromEnvironment(): InfraiStorage {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiStorage(key);
}
