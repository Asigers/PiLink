import type { IncomingMessage } from "../../types.js";
import type { OutgoingMessage } from "../types.js";
import type { ChannelAdapter } from "../types.js";
import type { ILinkCredentials, ILinkMessage } from "./ilink-api.js";
import { ILinkApiClient, ILinkSessionExpiredError } from "./ilink-api.js";
import { WeChatInboundStore } from "./inbound-store.js";

export interface ILinkTransportOptions {
  credentials: ILinkCredentials;
  inboundStore: WeChatInboundStore;
  logger?: (message: string) => void;
  api?: ILinkApiClient;
}

function messageText(message: ILinkMessage): string {
  const parts: string[] = [];
  for (const item of message.item_list ?? []) {
    if (item.type === 1 && item.text_item?.text) parts.push(item.text_item.text);
    if (item.type === 3 && item.voice_item?.text) parts.push(item.voice_item.text);
  }
  return parts.join("\n").trim();
}

function messageId(message: ILinkMessage): string {
  return message.message_id ?? (message.seq === undefined ? "" : String(message.seq));
}

export class WeChatIlinkTransport implements ChannelAdapter {
  private readonly api: ILinkApiClient;
  private readonly abortController = new AbortController();
  private loopPromise: Promise<void> | null = null;
  private stopping = false;
  private readonly log: (message: string) => void;

  constructor(private readonly options: ILinkTransportOptions) {
    this.api = options.api ?? new ILinkApiClient(options.credentials.baseUrl, options.credentials.botToken);
    this.log = options.logger ?? ((message) => console.log("[PiLink/WeChat] " + message));
  }

  start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    if (this.loopPromise) return this.loopPromise;
    this.loopPromise = this.run(onMessage);
    return this.loopPromise;
  }

  private async run(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    let failures = 0;
    let timeoutMs = 35_000;
    try {
      await this.api.notifyStart().catch(error => this.log("notifyStart warning: " + String(error)));
      this.log("iLink long-poll started; only the QR-login owner direct chat is accepted");
      while (!this.abortController.signal.aborted) {
        try {
          const cursor = this.options.inboundStore.getCursor();
          const response = await this.api.getUpdates(cursor, this.abortController.signal, timeoutMs);
          if (this.abortController.signal.aborted) break;
          if ((response.ret !== undefined && response.ret !== 0) || (response.errcode !== undefined && response.errcode !== 0)) {
            if (response.ret === -14 || response.errcode === -14) throw new ILinkSessionExpiredError();
            throw new Error("iLink getUpdates failed: ret=" + response.ret + " errcode=" + response.errcode + " " + (response.errmsg ?? ""));
          }
          if (response.longpolling_timeout_ms && response.longpolling_timeout_ms > 0) {
            timeoutMs = Math.min(Math.max(response.longpolling_timeout_ms, 5_000), 60_000);
          }

          let allHandled = true;
          for (const full of response.msgs ?? []) {
            if (full.message_type !== 1 || full.group_id) continue;
            const senderId = full.from_user_id ?? "";
            if (senderId !== this.options.credentials.ownerUserId) {
              this.log("ignored message from a non-owner sender");
              continue;
            }
            const id = messageId(full);
            if (!id) {
              this.log("ignored inbound message without a stable message_id");
              continue;
            }
            const shouldHandle = this.options.inboundStore.beginMessage({
              messageId: id,
              senderId,
              contextToken: full.context_token,
              payload: full
            });
            if (!shouldHandle) continue;

            const text = messageText(full);
            if (!text) {
              await this.api.sendTextMessage(senderId, "PiLink 第一版目前支持文字消息和微信已转写的语音文本；图片、文件和视频将在后续版本接入。", full.context_token);
              this.options.inboundStore.markProcessed(id);
              continue;
            }

            try {
              await onMessage({
                accountId: this.options.credentials.ilinkBotId,
                chatType: "direct",
                peerId: this.options.credentials.ownerUserId,
                senderId,
                messageId: id,
                contextToken: full.context_token,
                text,
                receivedAt: full.create_time_ms ? new Date(full.create_time_ms).toISOString() : new Date().toISOString()
              });
              this.options.inboundStore.markProcessed(id);
            } catch (error) {
              allHandled = false;
              this.log("inbound dispatch failed; cursor will not advance: " + String(error));
              break;
            }
          }

          if (allHandled && response.get_updates_buf) this.options.inboundStore.saveCursor(response.get_updates_buf);
          failures = 0;
        } catch (error) {
          if (this.abortController.signal.aborted) break;
          if (error instanceof ILinkSessionExpiredError) throw error;
          failures += 1;
          this.log("poll error (" + failures + "): " + (error instanceof Error ? error.message : String(error)));
          if (failures >= 3) {
            await new Promise(resolve => setTimeout(resolve, 30_000));
            failures = 0;
          } else {
            await new Promise(resolve => setTimeout(resolve, 2_000));
          }
        }
      }
    } finally {
      await this.api.notifyStop().catch(error => this.log("notifyStop warning: " + String(error)));
      this.log("iLink long-poll stopped");
    }
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    await this.api.sendTextMessage(message.peerId, message.text, message.contextToken);
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.loopPromise ?? Promise.resolve();
    this.stopping = true;
    this.abortController.abort();
    await this.loopPromise?.catch(() => undefined);
  }
}
