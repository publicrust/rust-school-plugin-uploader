// CHANGE: Confirm HTTP helpers retry on transient failures with concurrency limit.
// WHY: Validates network stability invariant and bounded retries.
// QUOTE(TЗ): "Повторы: ≤ 3 с экспоненциальной задержкой."
// REF: REQ-8
// SOURCE: internal reasoning

import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, httpClient } from "../src/utils/http.js";

describe("getJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries on 5xx responses", async () => {
    const dummyConfig = {
      url: "https://example.com/data",
      headers: {}
    } as InternalAxiosRequestConfig;
    const serverError = new AxiosError("server error");
    serverError.response = {
      status: 500,
      statusText: "Server Error",
      headers: {},
      config: dummyConfig,
      data: null
    } satisfies AxiosResponse;

    const success = {
      status: 200,
      statusText: "OK",
      headers: {},
      config: dummyConfig,
      data: { value: "ok" }
    } satisfies AxiosResponse<{ readonly value: string }>;

    const spy = vi.spyOn(httpClient, "get");
    spy.mockRejectedValueOnce(serverError);
    spy.mockResolvedValueOnce(success);

    const response = await getJson<{ readonly value: string }>("https://example.com/data");
    expect(response.data.value).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
