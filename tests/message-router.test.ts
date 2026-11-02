import { afterEach, describe, expect, it } from "vitest";
import { MessageRouter } from "../src/bridge/message-router.js";
import { JobManager } from "../src/bridge/job-manager.js";
import { SessionManager } from "../src/bridge/session-manager.js";
import { parseConfig } from "../src/config.js";
import { openDatabase, type PiLinkDatabase } from "../src/storage/database.js";

class FakeWorker {
  async promptAndWait(message: string) {
    return { events: [], text: "Pi answered: " + message };
  }
  async getLastAssistantText() { return null; }
  async abort() {}
}

describe("personal WeChat message routing", () => {
  let database: PiLinkDatabase | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it("routes owner messages to Pi and returns the final answer", async () => {
    database = openDatabase(":memory:");
    const sessions = new SessionManager(database.connection);
    const jobs = new JobManager(database.connection);
    const replies: string[] = [];
    const fakeWorker = new FakeWorker();
    const workers = {
      getOrStart: async () => fakeWorker
    };
    const router = new MessageRouter(parseConfig({}, {}), sessions, jobs, workers, "owner-id", async reply => {
      replies.push(reply.text);
    });

    await router.handle({
      accountId: "bot-id",
      chatType: "direct",
      peerId: "owner-id",
      senderId: "owner-id",
      messageId: "msg-1",
      contextToken: "ctx-1",
      text: "search the web"
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(replies[0]).toContain("已收到");
    expect(replies[1]).toBe("Pi answered: search the web");
    const chatId = sessions.getOrCreateChat("bot-id", "owner-id");
    const conversation = sessions.getActiveConversation(chatId);
    expect(conversation).toBeTruthy();
    expect(jobs.list(conversation!.id)[0].status).toBe("completed");
    await router.stop();
  });

  it("creates a new independent Pi conversation on /new", async () => {
    database = openDatabase(":memory:");
    const sessions = new SessionManager(database.connection);
    const jobs = new JobManager(database.connection);
    const replies: string[] = [];
    const workers = { getOrStart: async () => new FakeWorker() };
    const router = new MessageRouter(parseConfig({}, {}), sessions, jobs, workers, "owner-id", async reply => {
      replies.push(reply.text);
    });
    const message = {
      accountId: "bot-id",
      chatType: "direct" as const,
      peerId: "owner-id",
      senderId: "owner-id",
      messageId: "msg-new",
      contextToken: "ctx-new",
      text: "/new"
    };

    await router.handle(message);

    const chatId = sessions.getOrCreateChat("bot-id", "owner-id");
    expect(sessions.listConversations(chatId)).toHaveLength(1);
    expect(replies[0]).toContain("新会话");
    await router.stop();
  });

  it("rejects messages that do not come from the linked personal owner", async () => {
    database = openDatabase(":memory:");
    const sessions = new SessionManager(database.connection);
    const jobs = new JobManager(database.connection);
    const router = new MessageRouter(parseConfig({}, {}), sessions, jobs, { getOrStart: async () => new FakeWorker() }, "owner-id", async () => undefined);

    await expect(router.handle({
      accountId: "bot-id",
      chatType: "direct",
      peerId: "intruder",
      senderId: "intruder",
      messageId: "msg-bad",
      text: "hello"
    })).rejects.toThrow(/personal WeChat owner/);
    await router.stop();
  });
});
