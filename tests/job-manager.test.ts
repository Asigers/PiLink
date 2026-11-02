import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type PiLinkDatabase } from "../src/storage/database.js";
import { SessionManager } from "../src/bridge/session-manager.js";
import { JobManager } from "../src/bridge/job-manager.js";

describe("JobManager", () => {
  let database: PiLinkDatabase;
  let sessions: SessionManager;
  let jobs: JobManager;
  let conversationId: string;

  beforeEach(() => {
    database = openDatabase(":memory:");
    sessions = new SessionManager(database.connection);
    jobs = new JobManager(database.connection);
    const chatId = sessions.getOrCreateChat("bot-1", "user-1");
    conversationId = sessions.createConversation({
      chatId,
      title: "Assistant",
      workspaceId: "default",
      workspacePath: "/tmp/pilink/default",
      piSessionDir: "/tmp/pilink/sessions"
    }).id;
  });

  afterEach(() => database.close());

  it("tracks a job from queued to completed", () => {
    const job = jobs.create(conversationId, "Run a smoke test");
    expect(job.status).toBe("queued");
    jobs.markRunning(job.id);
    expect(jobs.get(job.id)?.status).toBe("running");
    jobs.complete(job.id);
    expect(jobs.get(job.id)?.status).toBe("completed");
    expect(jobs.get(job.id)?.startedAt).toBeTruthy();
    expect(jobs.get(job.id)?.completedAt).toBeTruthy();
  });

  it("records failures", () => {
    const job = jobs.create(conversationId, "Fail intentionally");
    jobs.markRunning(job.id);
    jobs.fail(job.id, "test failure");
    expect(jobs.get(job.id)?.status).toBe("failed");
    expect(jobs.get(job.id)?.error).toBe("test failure");
  });
});
