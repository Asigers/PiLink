import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AppConfig } from "../config.js";
import type { IncomingMessage } from "../types.js";
import { JobManager } from "./job-manager.js";
import { SessionManager } from "./session-manager.js";
import { PiWorkerPool } from "../pi/worker-pool.js";

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel));
}

export class MessageRouter {
  constructor(
    private readonly config: AppConfig,
    private readonly sessions: SessionManager,
    private readonly jobs: JobManager,
    private readonly workers: PiWorkerPool
  ) {}

  async handle(message: IncomingMessage): Promise<{ jobId: string; conversationId: string; text: string }> {
    if (!this.config.security.allowedWechatUserIds.includes(message.senderId)) {
      throw new Error("Sender is not allowlisted");
    }
    if (!message.text.trim()) throw new Error("Empty text messages are not supported yet");

    const workspacePath = resolve(this.config.workspaces.defaultPath);
    const roots = this.config.security.workspaceRoots.map((root) => resolve(root));
    if (!roots.some((root) => isWithin(root, workspacePath))) {
      throw new Error("Default workspace is outside the configured workspace roots");
    }

    const chatId = this.sessions.getOrCreateChat(message.accountId, message.peerId, message.chatType, message.contextToken);
    const conversation = this.sessions.getActiveConversation(chatId) ?? this.sessions.createConversation({
      chatId,
      title: "Assistant",
      workspaceId: this.config.workspaces.defaultId,
      workspacePath,
      piSessionDir: resolve(this.config.pi.sessionDir)
    });

    const job = this.jobs.create(conversation.id, message.text);
    this.jobs.markRunning(job.id);
    try {
      const worker = await this.workers.getOrStart({
        sessionId: conversation.piSessionId,
        sessionDir: conversation.piSessionDir,
        cwd: conversation.workspacePath,
        name: conversation.title
      });
      const result = await worker.promptAndWait(message.text);
      this.jobs.complete(job.id);
      return { jobId: job.id, conversationId: conversation.id, text: result.text };
    } catch (error) {
      this.jobs.fail(job.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}
