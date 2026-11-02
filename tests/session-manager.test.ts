import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type PiLinkDatabase } from "../src/storage/database.js";
import { SessionManager } from "../src/bridge/session-manager.js";

describe("SessionManager", () => {
  let database: PiLinkDatabase;
  let manager: SessionManager;

  beforeEach(() => {
    database = openDatabase(":memory:");
    manager = new SessionManager(database.connection);
  });

  afterEach(() => database.close());

  it("creates one chat identity for the same account and peer", () => {
    const first = manager.getOrCreateChat("bot-1", "user-1");
    const second = manager.getOrCreateChat("bot-1", "user-1");
    expect(second).toBe(first);
  });

  it("creates and switches logical conversations independently", () => {
    const chatId = manager.getOrCreateChat("bot-1", "user-1");
    const first = manager.createConversation({
      chatId, title: "Research", workspaceId: "research",
      workspacePath: "/tmp/pilink/research", piSessionDir: "/tmp/pilink/sessions"
    });
    const second = manager.createConversation({
      chatId, title: "Coding", workspaceId: "coding",
      workspacePath: "/tmp/pilink/coding", piSessionDir: "/tmp/pilink/sessions"
    });
    expect(manager.getActiveConversation(chatId)?.id).toBe(second.id);
    expect(manager.switchConversation(chatId, first.id)).toBe(true);
    expect(manager.getActiveConversation(chatId)?.id).toBe(first.id);
    expect(manager.listConversations(chatId)).toHaveLength(2);
    expect(first.piSessionId).not.toBe(second.piSessionId);
  });

  it("does not allow switching to another chat's conversation", () => {
    const firstChat = manager.getOrCreateChat("bot-1", "user-1");
    const secondChat = manager.getOrCreateChat("bot-1", "user-2");
    const conversation = manager.createConversation({
      chatId: firstChat, title: "Private", workspaceId: "default",
      workspacePath: "/tmp/pilink/default", piSessionDir: "/tmp/pilink/sessions"
    });
    expect(manager.switchConversation(secondChat, conversation.id)).toBe(false);
  });
}
