// CHANGE: Deliver Discord notifications with embeds and controlled attachment handling.
// WHY: Meets notification requirements including attachment limits and retry semantics.
// QUOTE(TЗ): "Сформировать Discord embed … и прикрепить файл плагина (`.cs`), если не превышает лимит."
// REF: REQ-5
// SOURCE: internal reasoning

import FormData from "form-data";
import sanitize from "sanitize-filename";
import { AxiosError } from "axios";
import { DISCORD, FLAGS } from "./config.js";
import { debug, error as logError, info } from "./logger.js";
import { IndexedPlugin } from "./types.js";
import { httpClient } from "./utils/http.js";

const MAX_WEBHOOK_ATTEMPTS = 5;

interface AttachmentPayload {
  readonly name: string;
  readonly buffer: Buffer;
}

interface DiscordEmbedField {
  readonly name: string;
  readonly value: string;
  readonly inline?: boolean;
}

interface DiscordEmbed {
  readonly title: string;
  readonly description: string;
  readonly color: number;
  readonly fields: readonly DiscordEmbedField[];
  readonly timestamp: string;
}

function buildEmbed(plugin: IndexedPlugin): DiscordEmbed {
  const fields: DiscordEmbedField[] = [];
  if (plugin.plugin_author) {
    fields.push({ name: "👤 Author", value: plugin.plugin_author, inline: true });
  }
  if (plugin.plugin_version) {
    fields.push({ name: "🏷 Version", value: plugin.plugin_version, inline: true });
  }
  if (plugin.repository?.full_name) {
    fields.push({ name: "📦 Repository", value: plugin.repository.full_name, inline: true });
  }
  if (plugin.categories && plugin.categories.length > 0) {
    fields.push({ name: "🏷 Categories", value: plugin.categories.join(", "), inline: false });
  }
  if (plugin.file.raw_url) {
    fields.push({ name: "🔗 Raw", value: plugin.file.raw_url, inline: false });
  }
  return {
    title: `🧩 ${plugin.plugin_name ?? plugin.file.path ?? "Plugin"}`,
    description: plugin.plugin_description?.slice(0, 500) ?? "New or updated plugin detected.",
    color: 0x00adff,
    fields: [...fields],
    timestamp: new Date().toISOString()
  };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, delayMs);
  });
}

function attachmentAllowed(plugin: IndexedPlugin, attachment: AttachmentPayload): boolean {
  if (attachment.buffer.byteLength > DISCORD.MAX_ATTACHMENT_BYTES) {
    debug(`Attachment exceeds limit for ${plugin.file.raw_url ?? "unknown"}.`);
    return false;
  }
  if (FLAGS.ONLY_CS_ATTACHMENTS && !attachment.name.toLowerCase().endsWith(".cs")) {
    debug(`Attachment filtered by ONLY_CS_ATTACHMENTS for ${attachment.name}.`);
    return false;
  }
  return true;
}

/**
 * Send Discord webhook message with optional attachment.
 *
 * @param plugin - Plugin describing the notification.
 * @param attachment - Optional attachment payload.
 */
export async function sendPluginWebhook(plugin: IndexedPlugin, attachment?: AttachmentPayload): Promise<void> {
  if (!DISCORD.WEBHOOK_URL) {
    throw new Error("DISCORD_WEBHOOK_URL must be configured.");
  }

  const embed = buildEmbed(plugin);
  const sanitizedName = attachment ? sanitize(attachment.name) : undefined;

  for (let attempt = 0; attempt < MAX_WEBHOOK_ATTEMPTS; attempt += 1) {
    try {
      if (attachment && sanitizedName && attachmentAllowed(plugin, attachment)) {
        const form = new FormData();
        form.append("payload_json", JSON.stringify({ embeds: [embed] }));
        form.append("file", attachment.buffer, {
          filename: sanitizedName,
          contentType: "text/plain"
        });
        await httpClient.post(DISCORD.WEBHOOK_URL, form, {
          headers: form.getHeaders()
        });
      } else {
        await httpClient.post(DISCORD.WEBHOOK_URL, { embeds: [embed] });
      }
      info(`Webhook delivered for ${plugin.file.raw_url ?? plugin.plugin_name ?? "unknown plugin"}.`);
      return;
    } catch (cause) {
      const axiosError = cause as AxiosError<{ readonly retry_after?: number }>;
      const status = axiosError.response?.status ?? 0;
      if (status === 429) {
        const retryAfterSeconds = axiosError.response?.data?.retry_after ?? 1;
        const retryDelay = Math.ceil(retryAfterSeconds * 1000);
        debug(`Discord rate limited, retrying after ${retryDelay}ms.`);
        await sleep(retryDelay);
        continue;
      }
      if (status >= 500 && status < 600) {
        const delay = 500 * (attempt + 1);
        debug(`Discord 5xx response (${status}), retrying after ${delay}ms.`);
        await sleep(delay);
        continue;
      }
      logError(`Webhook failed with status ${status}: ${axiosError.message}`);
      throw axiosError;
    }
  }
  throw new Error("Failed to deliver webhook after retries.");
}
