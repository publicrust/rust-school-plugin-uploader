// CHANGE: Provide retrying HTTP utilities with concurrency limits.
// WHY: Ensures network stability and controlled parallelism per specification.
// QUOTE(TЗ): "Стабильность сети: бэкофф и повтор при 5xx/сетевых ошибках; уважать Discord 429 `retry_after`."
// REF: REQ-8
// SOURCE: internal reasoning

import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import pLimit from "p-limit";
import { NET } from "../config.js";
import { debug } from "../logger.js";

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

const concurrencyLimit = pLimit(Math.max(1, NET.CONCURRENCY));

const httpClient: AxiosInstance = axios.create({
  timeout: NET.TIMEOUT,
  maxRedirects: 5,
  headers: {
    "User-Agent": "PluginsNotifier/1.0 (+https://github.com/)",
    Accept: "application/json"
  }
});

function sleep(delayMs: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, delayMs);
  });
}

function normaliseHeaders(headers: AxiosResponse["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      out[key.toLowerCase()] = value.join(", ");
    } else if (typeof value === "string") {
      out[key.toLowerCase()] = value;
    }
  }
  return out;
}

async function executeWithRetry<T>(operation: () => Promise<AxiosResponse<T>>, attempt: number): Promise<AxiosResponse<T>> {
  try {
    return await operation();
  } catch (rawError) {
    const error = rawError as AxiosError;
    const nextAttempt = attempt + 1;
    if (nextAttempt >= RETRY_ATTEMPTS) {
      throw error;
    }
    const status = error.response?.status;
    const isNetworkIssue = error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ECONNABORTED";
    const isRetryableStatus = typeof status === "number" && status >= 500 && status < 600;
    if (!isNetworkIssue && !isRetryableStatus) {
      throw error;
    }
    const backoff = RETRY_BASE_DELAY_MS * 2 ** attempt;
    debug(`HTTP retry (${nextAttempt}/${RETRY_ATTEMPTS}) after ${backoff}ms for ${error.config?.url ?? "unknown-url"}`);
    await sleep(backoff);
    return executeWithRetry(operation, nextAttempt);
  }
}

/**
 * Perform GET request expecting JSON payload.
 *
 * @param url - Target URL.
 * @returns Response data and headers.
 */
export async function getJson<T>(url: string): Promise<{ readonly data: T; readonly headers: Record<string, string>; readonly status: number }> {
  const response = await concurrencyLimit(() => executeWithRetry(() => httpClient.get<T>(url), 0));
  return {
    data: response.data,
    headers: normaliseHeaders(response.headers),
    status: response.status
  };
}

/**
 * Perform GET request expecting binary payload.
 *
 * @param url - Target URL.
 * @returns Buffer with binary payload and response headers.
 */
export async function getBinary(url: string): Promise<{ readonly data: Buffer; readonly headers: Record<string, string>; readonly status: number }> {
  const response = await concurrencyLimit(() =>
    executeWithRetry(() => httpClient.get<ArrayBuffer>(url, { responseType: "arraybuffer" }), 0)
  );
  return {
    data: Buffer.from(response.data),
    headers: normaliseHeaders(response.headers),
    status: response.status
  };
}

/**
 * Perform HEAD request to retrieve metadata without downloading payload.
 *
 * @param url - Target URL.
 * @returns Normalised headers to inspect metadata.
 */
export async function head(url: string): Promise<{ readonly headers: Record<string, string>; readonly status: number }> {
  const response = await concurrencyLimit(() => executeWithRetry(() => httpClient.head(url), 0));
  return {
    headers: normaliseHeaders(response.headers),
    status: response.status
  };
}

export { httpClient };
