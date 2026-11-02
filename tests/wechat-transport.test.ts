import { afterEach, describe, expect, it } from "vitest";
import { WeChatIlinkTransport } from "../src/channels/wechat/ilink-transport.js";
import type { ILinkApiClient } from "../src/channels/wechat/ilink-api.js";
import { WeChatInboundStore } from "../src/channels/wechat/inbound-store.js";
import { SessionManager } from "../src/bridge/session-manager.js";
import { openDatabase, type PiLinkDatabase } from "../src/storage/database.js";

describe("WeChat iLink transport", () => {
  let database: PiLinkDatabase | undefined;
  afterEach(() => { database?.close(); database = undefined; });

  it("dispatches only the QR owner direct message and persists the cursor", async () => {
    database = openDatabase(":memory:");
    const sessions = new SessionManager(database.connection);
    const chatId = sessions.getOrCreateChat("bot-id", "owner-id");
    const inboundStore = new WeChatInboundStore(database.connection, chatId);
    let delivered = false;
    let stopped = false;
    let resolveMessage!: () => void;
    const messageHandled = new Promise<void>(resolve => { resolveMessage = resolve; });
    const fakeApi = {
      notifyStart: async () => undefined,
      notifyStop: async () => { stopped = true; },
      sendTextMessage: async () => undefined,
      getUpdates: async (_cursor: string, signal: AbortSignal) => {
        if (!delivered) {
          delivered = true;
          return {
            ret: 0,
            get_updates_buf: "cursor-after-batch",
            msgs: [
              { message_id: "owner-message", message_type: 1, from_user_id: "owner-id", context_token: "reply-context", item_list: [{ type: 1, text_item: { text: "hello Pi" } }] },
              { message_id: "other-message", message_type: 1, from_user_id: "other-user", context_token: "ignored-context", item_list: [{ type: 1, text_item: { text: "not the owner" } }] }
            ]
          };
        }
        return new Promise(resolve => {
          if (signal.aborted) resolve({ ret: 0, msgs: [] });
          else signal.addEventListener("abort", () => resolve({ ret: 0, msgs: [] }), { once: true });
        });
      }
    } as unknown as ILinkApiClient;
    const transport = new WeChatIlinkTransport({
      credentials: { botToken: "token", ilinkBotId: "bot-id", ownerUserId: "owner-id", baseUrl: "https://api.test", connectedAt: new Date().toISOString() },
      inboundStore, api: fakeApi, logger: () => undefined
    });
    const running = transport.start(async message => {
      expect(message.senderId).toBe("owner-id");
      expect(message.peerId).toBe("owner-id");
      expect(message.contextToken).toBe("reply-context");
      expect(message.text).toBe("hello Pi");
      resolveMessage();
    });
    await messageHandled;
    for (let attempt = 0; attempt < 10 && inboundStore.getCursor() !== "cursor-after-batch"; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(inboundStore.getCursor()).toBe("cursor-after-batch");
    expect(inboundStore.beginMessage({ messageId: "owner-message", senderId: "owner-id", contextToken: "reply-context", payload: {} })).toBe(false);
    await transport.stop();
    await running;
    expect(stopped).toBe(true);
  });
});
