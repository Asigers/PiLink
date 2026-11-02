import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ChatType, ConversationRecord } from "../types.js";

interface ConversationRow {
  id: string;
  chat_id: string;
  title: string;
  workspace_id: string;
  workspace_path: string;
  pi_session_id: string;
  pi_session_dir: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

function mapConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    title: row.title,
    workspaceId: row.workspace_id,
    workspacePath: row.workspace_path,
    piSessionId: row.pi_session_id,
    piSessionDir: row.pi_session_dir,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SessionManager {
  constructor(private readonly db: Database.Database) {}

  getOrCreateChat(accountId: string, peerId: string, chatType: ChatType = "direct", contextToken?: string): string {
    const now = new Date().toISOString();
    this.db.prepare(
      "INSERT OR IGNORE INTO chats(id, account_id, chat_type, peer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), accountId, chatType, peerId, now, now);

    const chat = this.db.prepare(
      "SELECT id FROM chats WHERE account_id = ? AND chat_type = ? AND peer_id = ?"
    ).get(accountId, chatType, peerId) as { id: string } | undefined;
    if (!chat) throw new Error("Failed to create or load chat");

    if (contextToken) {
      this.db.prepare("UPDATE chats SET last_context_token = ?, updated_at = ? WHERE id = ?")
        .run(contextToken, now, chat.id);
    }
    return chat.id;
  }

  createConversation(input: {
    chatId: string;
    title: string;
    workspaceId: string;
    workspacePath: string;
    piSessionDir: string;
  }): ConversationRecord {
    const now = new Date().toISOString();
    const id = randomUUID();
    const piSessionId = "conv_" + randomUUID().replace(/-/g, "");
    const insert = this.db.transaction(() => {
      const chat = this.db.prepare("SELECT id FROM chats WHERE id = ?").get(input.chatId);
      if (!chat) throw new Error("Chat does not exist: " + input.chatId);
      this.db.prepare(
        "INSERT INTO conversations(id, chat_id, title, workspace_id, workspace_path, pi_session_id, pi_session_dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)"
      ).run(id, input.chatId, input.title, input.workspaceId, input.workspacePath, piSessionId, input.piSessionDir, now, now);
      this.db.prepare("UPDATE chats SET active_conversation_id = ?, updated_at = ? WHERE id = ?")
        .run(id, now, input.chatId);
    });
    insert();
    const conversation = this.getConversation(id);
    if (!conversation) throw new Error("Conversation was not persisted");
    return conversation;
  }

  getConversation(id: string): ConversationRecord | undefined {
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
    return row ? mapConversation(row) : undefined;
  }

  getActiveConversation(chatId: string): ConversationRecord | undefined {
    const row = this.db.prepare(
      "SELECT c.* FROM conversations c JOIN chats h ON h.active_conversation_id = c.id WHERE h.id = ? AND c.status = 'active'"
    ).get(chatId) as ConversationRow | undefined;
    return row ? mapConversation(row) : undefined;
  }

  switchConversation(chatId: string, conversationId: string): boolean {
    const conversation = this.db.prepare(
      "SELECT id FROM conversations WHERE id = ? AND chat_id = ? AND status = 'active'"
    ).get(conversationId, chatId);
    if (!conversation) return false;
    this.db.prepare("UPDATE chats SET active_conversation_id = ?, updated_at = ? WHERE id = ?")
      .run(conversationId, new Date().toISOString(), chatId);
    return true;
  }

  listConversations(chatId: string): ConversationRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM conversations WHERE chat_id = ? ORDER BY updated_at DESC"
    ).all(chatId) as ConversationRow[];
    return rows.map(mapConversation);
  }

  renameConversation(conversationId: string, title: string): void {
    this.db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, new Date().toISOString(), conversationId);
  }

  archiveConversation(chatId: string, conversationId: string): boolean {
    const now = new Date().toISOString();
    const update = this.db.transaction(() => {
      const result = this.db.prepare(
        "UPDATE conversations SET status = 'archived', updated_at = ? WHERE id = ? AND chat_id = ?"
      ).run(now, conversationId, chatId);
      if (result.changes === 0) return false;
      this.db.prepare(
        "UPDATE chats SET active_conversation_id = NULL, updated_at = ? WHERE id = ? AND active_conversation_id = ?"
      ).run(now, chatId, conversationId);
      return true;
    });
    return update();
  }
}
