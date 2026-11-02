import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { JobRecord, JobStatus } from "../types.js";

interface JobRow {
  id: string;
  conversation_id: string;
  description: string;
  status: JobStatus;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.error ? { error: row.error } : {})
  };
}

export class JobManager {
  constructor(private readonly db: Database.Database) {}

  create(conversationId: string, description: string): JobRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      "INSERT INTO jobs(id, conversation_id, description, status, created_at) VALUES (?, ?, ?, 'queued', ?)"
    ).run(id, conversationId, description, now);
    const job = this.get(id);
    if (!job) throw new Error("Job was not persisted");
    return job;
  }

  get(id: string): JobRecord | undefined {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? mapJob(row) : undefined;
  }

  list(conversationId: string, limit = 20): JobRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM jobs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(conversationId, limit) as JobRow[];
    return rows.map(mapJob);
  }

  markRunning(id: string): void { this.update(id, "running", null, new Date().toISOString(), null); }
  complete(id: string): void { this.update(id, "completed", null, null, new Date().toISOString()); }
  fail(id: string, error: string): void { this.update(id, "failed", error, null, new Date().toISOString()); }
  cancel(id: string): void { this.update(id, "cancelled", null, null, new Date().toISOString()); }

  private update(id: string, status: JobStatus, error: string | null, startedAt: string | null, completedAt: string | null): void {
    const current = this.get(id);
    if (!current) throw new Error("Unknown job: " + id);
    const nextStartedAt = startedAt ?? current.startedAt ?? null;
    this.db.prepare(
      "UPDATE jobs SET status = ?, error = ?, started_at = ?, completed_at = ? WHERE id = ?"
    ).run(status, error, nextStartedAt, completedAt, id);
  }
}
