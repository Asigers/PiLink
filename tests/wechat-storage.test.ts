import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WeChatCredentialsStore } from "../src/channels/wechat/credentials-store.js";
import { WeChatInboundStore } from "../src/channels/wechat/inbound-store.js";
import { SessionManager } from "../src/bridge/session-manager.js";
import { openDatabase, type PiLinkDatabase } from "../src/storage/database.js";

describe("WeChat local state", () => {
  let directory = "";
  let database: PiLinkDatabase | undefined;

  afterEach(async () => {
    database?.close();
    database = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = "";
  });

  it("stores bot credentials with owner-only file permissions", async () => {
    directory = await mkdtemp(join(tmpdir(), "pilink-creds-"));
    const store = new WeChatCredentialsStore(join(directory, "credentials.json"));
    const credentials = {
      botToken: "do-not-log-this",
      ilinkBotId: "bot-id",
      ownerUserId: "owner-id",
      baseUrl: "https://api.weixin.test",
      connectedAt: new Date().toISOString()
    };

    await store.save(credentials);

    expect(await store.load()).toEqual(credentials);
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    expect(await readFile(store.path, "utf8")).toContain("botToken");
  });

  it("persists the poll cursor and deduplicates processed messages", () => {
    database = openDatabase(":memory:");
    const sessions = new SessionManager(database.connection);
    const chatId = sessions.getOrCreateChat("bot", "owner");
    const store = new WeChatInboundStore(database.connection, chatId);

    expect(store.getCursor()).toBe("");
    store.saveCursor("cursor-1");
    expect(store.getCursor()).toBe("cursor-1");

    const message = { messageId: "18446744073709551615", senderId: "owner", contextToken: "ctx", payload: { text: "hi" } };
    expect(store.beginMessage(message)).toBe(true);
    store.markProcessed(message.messageId);
    expect(store.beginMessage(message)).toBe(false);
  });
});
