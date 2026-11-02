import type Database from "better-sqlite3";

export const CURRENT_SCHEMA_VERSION = 1;

export function migrateDatabase(db: Database.Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number | null } | undefined;
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    const migration = db.transaction(() => {
      db.exec(
        "CREATE TABLE IF NOT EXISTS chats (" +
          "id TEXT PRIMARY KEY, account_id TEXT NOT NULL, chat_type TEXT NOT NULL, peer_id TEXT NOT NULL," +
          "active_conversation_id TEXT, last_context_token TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL," +
          "UNIQUE(account_id, chat_type, peer_id));" +
        "CREATE TABLE IF NOT EXISTS conversations (" +
          "id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id), title TEXT NOT NULL," +
          "workspace_id TEXT NOT NULL, workspace_path TEXT NOT NULL, pi_session_id TEXT NOT NULL UNIQUE," +
          "pi_session_dir TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active'," +
          "created_at TEXT NOT NULL, updated_at TEXT NOT NULL);" +
        "CREATE INDEX IF NOT EXISTS idx_conversations_chat_updated ON conversations(chat_id, updated_at DESC);" +
        "CREATE TABLE IF NOT EXISTS jobs (" +
          "id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), description TEXT NOT NULL," +
          "status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT);" +
        "CREATE INDEX IF NOT EXISTS idx_jobs_conversation_created ON jobs(conversation_id, created_at DESC);" +
        "CREATE TABLE IF NOT EXISTS inbound_messages (" +
          "id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id), sender_id TEXT NOT NULL," +
          "message_id TEXT NOT NULL, context_token TEXT, payload_json TEXT NOT NULL," +
          "status TEXT NOT NULL DEFAULT 'received', received_at TEXT NOT NULL, UNIQUE(chat_id, message_id));" +
        "CREATE TABLE IF NOT EXISTS outbox (" +
          "id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id), context_token TEXT," +
          "payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0," +
          "created_at TEXT NOT NULL, sent_at TEXT);" +
        "CREATE TABLE IF NOT EXISTS approvals (" +
          "id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), tool_name TEXT NOT NULL," +
          "arguments_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', expires_at TEXT," +
          "created_at TEXT NOT NULL, resolved_at TEXT);"
      );
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(1, new Date().toISOString());
    });
    migration();
  }
}
