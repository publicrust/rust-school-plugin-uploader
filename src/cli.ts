// CHANGE: Extract CLI orchestration functions for reuse in program entrypoint and tests.
// WHY: Facilitates verification of CLI invariants without executing process-wide side effects.
// QUOTE(TЗ): "CLI: `plugins notify` — основной режим ... `plugins dry-run` ... `plugins reset` ... `plugins state`."
// REF: REQ-7
// SOURCE: internal reasoning

import { Command } from "commander";
import { AxiosError } from "axios";
import { fetchDeleted, fetchIndex, filterDeleted, getFile } from "./api.js";
import { StateCache } from "./cache.js";
import { DISCORD, FLAGS, SOURCES } from "./config.js";
import { mergeIndices } from "./merger.js";
import { debug, error as logError, info } from "./logger.js";
import { IndexedPlugin } from "./types.js";
import { pluginKey } from "./utils/plugin-key.js";
import { sha256 } from "./utils/hashing.js";
import { sendPluginWebhook } from "./webhook.js";

/**
 * Fetch, merge, and filter plugin indices according to specification.
 *
 * @returns Array of plugins to upload sequentially.
 */
export async function fetchAndMergeIndices(): Promise<IndexedPlugin[]> {
  const [oxide, crawled, deleted] = await Promise.all([
    fetchIndex(SOURCES.OXIDE),
    fetchIndex(SOURCES.CRAWLED),
    fetchDeleted()
  ]);
  // CHANGE: Log upstream index fetch counts for observability.
  // WHY: Enhances runtime visibility into source sizes as part of logging invariant.
  // QUOTE(TЗ): "Логи: INFO (сводка), DEBUG (детали HTTP/кеша), ERROR (исключения)."
  // REF: REQ-9
  // SOURCE: internal reasoning
  debug(
    `Fetched indices: oxide=${oxide.count} crawled=${crawled.count} deleted=${deleted?.repositories.length ?? 0}`
  );
  const merged = mergeIndices(oxide, crawled);
  const filteredItems = filterDeleted(merged.items, deleted);
  info(`Fetched ${filteredItems.length} plugins after merge and filtering.`);
  return filteredItems;
}

// CHANGE: Sequentially upload every unseen plugin while resuming from cache.
// WHY: Requirement mandates uploading remaining plugins while skipping those already processed.
// QUOTE(TЗ): "Если мы плагин загружали и он есть в состоянии то мы его пропускаем."
// REF: REQ-10
// SOURCE: user request
export async function processAllPluginsSequentially(
  plugins: readonly IndexedPlugin[],
  state: Pick<StateCache, "entries" | "set" | "save">
): Promise<void> {
  const processedKeys = new Set(state.entries().map(entry => entry.key));
  const pending = plugins.filter(plugin => {
    const rawUrl = plugin.file.raw_url;
    return rawUrl ? !processedKeys.has(pluginKey(plugin)) : false;
  });

  if (pending.length === 0) {
    info("Sequential upload complete: no pending plugins to send.");
    await state.save();
    return;
  }

  const processedBefore = processedKeys.size;
  info(
    `Sequential upload starting for ${pending.length} pending plugins (processed ${processedBefore}, total indexed ${plugins.length}).`
  );
  let index = 0;
  let uploaded = 0;
  for (const plugin of plugins) {
    const rawUrl = plugin.file.raw_url;
    if (!rawUrl) {
      logError(`Skipping plugin without raw URL: ${pluginKey(plugin)}`);
      continue;
    }
    const key = pluginKey(plugin);
    if (processedKeys.has(key)) {
      // CHANGE: Skip plugins already in cache to resume from last checkpoint.
      // WHY: Ensures previously delivered plugins are not re-uploaded.
      // QUOTE(TЗ): "Если мы плагин загружали и он есть в состоянии то мы его пропускаем."
      // REF: REQ-10
      // SOURCE: user request
      debug(`Skipping cached plugin ${key}`);
      continue;
    }

    index += 1;

    info(`Uploading ${processedBefore + index}/${plugins.length}: ${rawUrl}`);

    let attachmentBuffer: Buffer | undefined;
    let contentHash: string | undefined;
    const allowsAttachment = !FLAGS.ONLY_CS_ATTACHMENTS || rawUrl.toLowerCase().endsWith(".cs");

    if (allowsAttachment) {
      try {
        attachmentBuffer = await getFile(rawUrl);
        contentHash = sha256(attachmentBuffer);
      } catch (error) {
        logError(`Download failed for ${rawUrl}: ${(error as Error).message}`);
        attachmentBuffer = undefined;
        contentHash = undefined;
      }
    }

    const candidateName = plugin.file.path
      ? plugin.file.path.split("/").pop() ?? "plugin"
      : plugin.plugin_name ?? "plugin";
    const attachmentName = candidateName.toLowerCase().endsWith(".cs") ? candidateName : `${candidateName}.cs`;
    const safeBuffer =
      attachmentBuffer && attachmentBuffer.byteLength <= DISCORD.MAX_ATTACHMENT_BYTES ? attachmentBuffer : undefined;

    if (attachmentBuffer && !safeBuffer) {
      debug(`Attachment exceeds limit for ${rawUrl}; sending embed without file.`);
    }

    try {
      await sendPluginWebhook(
        plugin,
        safeBuffer
          ? {
              name: attachmentName,
              buffer: safeBuffer
            }
          : undefined
      );

      state.set({
        key,
        notifiedAt: new Date().toISOString(),
        contentHash,
        fileSha: plugin.file.sha,
        fileSize: safeBuffer?.byteLength ?? plugin.file.size
      });

      // CHANGE: Persist state after each successful upload to ensure cache exists even mid-run.
      // WHY: User requires cache file creation on every webhook delivery.
      // QUOTE(TЗ): "Мне надо что бы он создавался при каждой загрузке плагина в дискорд."
      // REF: REQ-6, REQ-10
      // SOURCE: user request
      await state.save();
      uploaded += 1;
      processedKeys.add(key);

      if (index % 100 === 0 || index === pending.length) {
        debug(
          `Sequential upload progress: ${(processedBefore + index)}/${plugins.length} (pending ${index}/${pending.length})`
        );
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const statusText = axiosError.response?.statusText;
      const responseBody = axiosError.response?.data;
      logError(
        `Webhook failed for ${rawUrl}: status ${status ?? "unknown"}${statusText ? ` ${statusText}` : ""} - ${axiosError.message}`
      );
      if (responseBody) {
        debug(`Webhook response body: ${typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)}`);
      }
      // Continue without recording state so the plugin is retried on next run.
      continue;
    }
  }

  if (uploaded === 0) {
    await state.save();
  }
  info("Sequential upload complete.");
}

/**
 * Notify mode entry point: fetch indices and sequentially dispatch all plugins.
 */
export async function notifyAction(): Promise<void> {
  const state = new StateCache();
  await state.load();
  const plugins = await fetchAndMergeIndices();
  await processAllPluginsSequentially(plugins, state);
}

/**
 * Dry-run mode entry point: preview sequential uploads without sending.
 */
export async function dryRunAction(): Promise<void> {
  const state = new StateCache();
  await state.load();
  const plugins = await fetchAndMergeIndices();
  const processedKeys = new Set(state.entries().map(entry => entry.key));
  const pending = plugins.filter(plugin => {
    const rawUrl = plugin.file.raw_url;
    return rawUrl ? !processedKeys.has(pluginKey(plugin)) : false;
  });
  info("Dry-run: listing first 20 pending plugins to be uploaded.");
  const preview = pending.slice(0, 20).map((plugin, idx) => ({
    index: idx + 1,
    rawUrl: plugin.file.raw_url ?? "",
    name: plugin.plugin_name ?? plugin.file.path ?? "",
    repository: plugin.repository?.full_name ?? ""
  }));
  console.table(preview);
  info(`Pending plugins: ${pending.length}; already processed: ${processedKeys.size}; indexed total: ${plugins.length}`);
}

/**
 * Reset mode entry point: clear cache file.
 */
export async function resetAction(): Promise<void> {
  const state = new StateCache();
  await state.load();
  await state.clear();
  info("State cache cleared.");
}

/**
 * State mode entry point: print cache statistics.
 */
export async function stateAction(): Promise<void> {
  const state = new StateCache();
  await state.load();
  console.log(state.stats());
}

/**
 * Construct commander program with configured commands.
 *
 * @returns Ready-to-use commander instance.
 */
export function buildProgram(): Command {
  const program = new Command();
  program.name("plugins-notifier").description("Rust plugins notifier").version("1.0.0");

  const pluginsCommand = program.command("plugins").description("Plugins operations");
  pluginsCommand.command("notify").description("Fetch and notify all plugins via webhook").action(async () => notifyAction());
  pluginsCommand.command("dry-run").description("Preview uploads without sending webhooks").action(async () => dryRunAction());
  pluginsCommand.command("reset").description("Clear notification cache").action(async () => resetAction());
  pluginsCommand.command("state").description("Display cache statistics").action(async () => stateAction());

  return program;
}

/**
 * Execute CLI with provided argv array.
 *
 * @param argv - Process arguments.
 */
export async function runCli(argv: readonly string[]): Promise<void> {
  const program = buildProgram();
  try {
    await program
      .configureOutput({
        outputError: (str: string) => logError(str)
      })
      .parseAsync([...argv]);
  } catch (error) {
    logError(`CLI failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
