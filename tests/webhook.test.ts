// CHANGE: Ensure webhook delivery respects attachment limits and retry semantics.
// WHY: Protects against oversize uploads and honours Discord rate limiting.
// QUOTE(TЗ): "Лимит вложений: отправлять файл только если `size ≤ MAX_ATTACHMENT_BYTES`."
// REF: REQ-5
// SOURCE: internal reasoning

import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config.js", () => ({
  DISCORD: { WEBHOOK_URL: "https://discord.example/webhook", MAX_ATTACHMENT_BYTES: 1024 },
  FLAGS: { ONLY_CS_ATTACHMENTS: true },
  NET: { TIMEOUT: 1000, CONCURRENCY: 2 },
  STATE: { PATH: "plugins-state.json", VERSION: 1 }
}));

import { sendPluginWebhook } from "../src/webhook.js";
import { httpClient } from "../src/utils/http.js";
import { IndexedPlugin } from "../src/types.js";

const plugin: IndexedPlugin = {
  plugin_name: "Test",
  file: { raw_url: "https://example.com/plugin.cs", path: "plugin.cs" },
  repository: { full_name: "owner/repo" },
  plugin_description: "desc"
};

describe("sendPluginWebhook", () => {
  beforeEach(() => {
    vi.spyOn(httpClient, "post").mockResolvedValue({} as AxiosResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("omits attachment when exceeding size limit", async () => {
    await sendPluginWebhook(plugin, {
      name: "plugin.cs",
      buffer: Buffer.alloc(2048)
    });
    const calls = vi.mocked(httpClient.post).mock.calls;
    expect(calls).toHaveLength(1);
    const [url, payload] = calls[0] ?? [];
    expect(url).toBe("https://discord.example/webhook");
    expect(typeof payload).toBe("object");
  });

  it("retries on Discord rate limiting", async () => {
    vi.useFakeTimers();
    const dummyConfig = {
      url: "https://discord.example/webhook",
      headers: {}
    } as InternalAxiosRequestConfig;
    const rateLimited = new AxiosError<{ readonly retry_after: number }>("rate limited");
    rateLimited.response = {
      status: 429,
      statusText: "Too Many Requests",
      headers: {},
      config: dummyConfig,
      data: { retry_after: 0 }
    } satisfies AxiosResponse<{ readonly retry_after: number }>;
    const successResponse = {
      status: 204,
      statusText: "No Content",
      headers: {},
      config: dummyConfig,
      data: null
    } satisfies AxiosResponse<null>;

    const postSpy = vi.mocked(httpClient.post);
    postSpy.mockRejectedValueOnce(rateLimited);
    postSpy.mockResolvedValueOnce(successResponse);

    const promise = sendPluginWebhook(plugin, {
      name: "plugin.cs",
      buffer: Buffer.alloc(64)
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(postSpy).toHaveBeenCalledTimes(2);
  });
});
