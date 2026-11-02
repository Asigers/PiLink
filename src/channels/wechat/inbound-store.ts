import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export class WeChatInboundStore {
  constructor(private readonly db: Database.Database, private readonly chatId: string) {}

  getCursor(): string {
    const row = this.db.prepare("SELECT value FROM channel_state WHERE key = ?")
      .get("wechat.get_updates_buf") as { value: string } | undefined;
    return row?.value ?? "";
  }

  saveCursor(cursor: string): void {
    if (!cursor) return;
    this.db.prepare(
      "INSERT INTO channel_state(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).run("wechat.get_updates_buf", cursor, new Date().toISOString());
  }

  beginMessage(input: { messageId: string; senderId: string; contextToken?: string; payload: unknown }): boolean {
    const now = new Date().toISOString();
    this.db.prepare(
      "INSERT OR IGNORE INTO inbound_messages(id, chat_id, sender_id, message_id, context_token, payload_json, status, received_at) VALUES (?, ?, ?, ?, ?, ?, 'received', ?)"
    ).run(randomUUID(), this.chatId, input.senderId, input.messageId, input.contextToken ?? null, JSON.stringify(input.payload), now);
    const row = this.db.prepare(
      "SELECT status FROM inbound_messages WHERE chat_id = ? AND message_id = ?"
    ).get(this.chatId, input.messageId) as { status: string } | undefined;
    return row?.status !== "processed";
  }

  markProcessed(messageId: string): void {
    this.db.prepare(
      "UPDATE inbound_messages SET status = 'processed' WHERE chat_id = ? AND message_id = ?"
    ).run(this.chatId, messageId);
  }
}
