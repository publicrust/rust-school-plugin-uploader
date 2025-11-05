// CHANGE: Validate sequential upload processes every plugin in order.
// WHY: Confirms adherence to updated requirement sending all plugins regardless of changes.
// QUOTE(TЗ): "Мы просто загружаем все 31к плагинов. А если они изменились то нам похуй."
// REF: REQ-10
// SOURCE: user request

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config.js", () => ({
  DISCORD: { WEBHOOK_URL: "https://discord.example/webhook", MAX_ATTACHMENT_BYTES: 1024 },
  FLAGS: { ONLY_CS_ATTACHMENTS: true },
  SOURCES: {
    OXIDE: "",
    CRAWLED: "",
    DELETED: ""
  },
  STATE: { PATH: "plugins-state.json", VERSION: 1 },
  NET: { TIMEOUT: 1000, CONCURRENCY: 2 }
}));

const getFileMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api.js", () => ({
  fetchIndex: vi.fn(),
  fetchDeleted: vi.fn(),
  filterDeleted: (items: unknown) => items,
  getFile: getFileMock
}));

const sendPluginWebhookMock = vi.hoisted(() => vi.fn());

vi.mock("../src/webhook.js", () => ({
  sendPluginWebhook: sendPluginWebhookMock
}));

import { processAllPluginsSequentially } from "../src/cli.js";
import { IndexedPlugin } from "../src/types.js";

describe("processAllPluginsSequentially", () => {
  afterEach(() => {
    getFileMock.mockReset();
    sendPluginWebhookMock.mockReset();
  });

  it("uploads each plugin sequentially and respects attachment rules", async () => {
    const buffer = Buffer.from("class Plugin {}");
    getFileMock.mockResolvedValue(buffer);

    const plugins: IndexedPlugin[] = [
      {
        plugin_name: "Alpha",
        file: { raw_url: "https://example.com/alpha.cs", path: "alpha.cs" },
        repository: { full_name: "owner/alpha" }
      },
      {
        plugin_name: "Beta",
        file: { raw_url: "https://example.com/readme.md", path: "README.md" },
        repository: { full_name: "owner/beta" }
      }
    ];

    const state = {
      entries: vi.fn().mockReturnValue([]),
      set: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined)
    } satisfies Pick<import("../src/cache.js").StateCache, "entries" | "set" | "save">;

    await processAllPluginsSequentially(plugins, state);

    expect(getFileMock).toHaveBeenCalledTimes(1);
    expect(getFileMock).toHaveBeenCalledWith("https://example.com/alpha.cs");

    expect(sendPluginWebhookMock).toHaveBeenCalledTimes(2);
    expect(sendPluginWebhookMock.mock.calls[0]?.[0].plugin_name).toBe("Alpha");
    expect(sendPluginWebhookMock.mock.calls[0]?.[1]).toMatchObject({ name: "alpha.cs" });
    expect(sendPluginWebhookMock.mock.calls[1]?.[0].plugin_name).toBe("Beta");
    expect(sendPluginWebhookMock.mock.calls[1]?.[1]).toBeUndefined();

    expect(state.set).toHaveBeenCalledTimes(2);
    expect(state.save).toHaveBeenCalledTimes(2);
  });

  it("skips plugins already tracked in cache", async () => {
    getFileMock.mockResolvedValue(Buffer.from("class Plugin {}"));

    const plugins: IndexedPlugin[] = [
      {
        plugin_name: "Alpha",
        file: { raw_url: "https://example.com/alpha.cs", path: "alpha.cs" },
        repository: { full_name: "owner/alpha" }
      },
      {
        plugin_name: "Beta",
        file: { raw_url: "https://example.com/beta.cs", path: "beta.cs" },
        repository: { full_name: "owner/beta" }
      }
    ];

    const state = {
      entries: vi.fn().mockReturnValue([
        { key: plugins[0].file.raw_url ?? "", notifiedAt: "2024-01-01T00:00:00Z" }
      ]),
      set: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined)
    } satisfies Pick<import("../src/cache.js").StateCache, "entries" | "set" | "save">;

    await processAllPluginsSequentially(plugins, state);

    expect(getFileMock).toHaveBeenCalledTimes(1);
    expect(getFileMock).toHaveBeenCalledWith("https://example.com/beta.cs");
    expect(sendPluginWebhookMock).toHaveBeenCalledTimes(1);
    expect(sendPluginWebhookMock.mock.calls[0]?.[0].plugin_name).toBe("Beta");
    expect(state.set).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledTimes(1);
  });

  it("logs error and continues when webhook fails", async () => {
    const plugins: IndexedPlugin[] = [
      {
        plugin_name: "Alpha",
        file: { raw_url: "https://example.com/alpha.cs", path: "alpha.cs" },
        repository: { full_name: "owner/alpha" }
      },
      {
        plugin_name: "Beta",
        file: { raw_url: "https://example.com/beta.cs", path: "beta.cs" },
        repository: { full_name: "owner/beta" }
      }
    ];

    getFileMock.mockResolvedValue(Buffer.from("class Plugin {}"));
    const error = new Error("Webhook 400");
    sendPluginWebhookMock.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);

    const state = {
      entries: vi.fn().mockReturnValue([]),
      set: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined)
    } satisfies Pick<import("../src/cache.js").StateCache, "entries" | "set" | "save">;

    await processAllPluginsSequentially(plugins, state);

    expect(sendPluginWebhookMock).toHaveBeenCalledTimes(2);
    expect(state.set).toHaveBeenCalledTimes(1);
  });
});
