import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AppConfig } from "../config.js";
import type { IncomingMessage, ConversationRecord } from "../types.js";
import type { OutgoingMessage } from "../channels/types.js";
import { JobManager } from "./job-manager.js";
import { SessionManager } from "./session-manager.js";
import type { WorkerDescriptor } from "../pi/worker-pool.js";
import type { PromptResult } from "../pi/rpc-worker.js";

interface RouterWorker {
  promptAndWait(message: string, timeoutMs?: number): Promise<PromptResult>;
  getLastAssistantText(): Promise<string | null>;
  abort(): Promise<void>;
}

interface WorkerProvider {
  getOrStart(descriptor: WorkerDescriptor): Promise<RouterWorker>;
}

interface QueuedTask {
  jobId: string;
  conversation: ConversationRecord;
  message: IncomingMessage;
  cancelled: boolean;
}

interface ActiveTask {
  task: QueuedTask;
  worker?: RouterWorker;
}

type ReplySender = (message: OutgoingMessage) => Promise<void>;

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel));
}

function splitText(value: string, limit = 3000): string[] {
  const characters = Array.from(value);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += limit) {
    chunks.push(characters.slice(index, index + limit).join(""));
  }
  return chunks.length ? chunks : ["（Agent 没有返回文本内容）"];
}

export class MessageRouter {
  private readonly queues = new Map<string, QueuedTask[]>();
  private readonly active = new Map<string, ActiveTask>();
  private readonly drains = new Map<string, Promise<void>>();
  private stopping = false;

  constructor(
    private readonly config: AppConfig,
    private readonly sessions: SessionManager,
    private readonly jobs: JobManager,
    private readonly workers: WorkerProvider,
    private readonly ownerUserId: string,
    private readonly sendReply: ReplySender
  ) {}

  async handle(message: IncomingMessage): Promise<void> {
    if (this.stopping) return;
    if (message.chatType !== "direct" || message.senderId !== this.ownerUserId) {
      throw new Error("Message is not from the linked personal WeChat owner");
    }
    if (!message.text.trim()) return;

    const chatId = this.sessions.getOrCreateChat(
      message.accountId,
      this.ownerUserId,
      "direct",
      message.contextToken
    );
    const command = message.text.trim().split(/\s+/, 1)[0].toLowerCase();

    if (command === "/help") {
      await this.reply(message, "PiLink 命令：\n/new - 新建独立会话\n/status - 查看当前任务\n/stop - 停止当前会话任务");
      return;
    }
    if (command === "/new") {
      this.createConversation(chatId, "Assistant");
      await this.reply(message, "已创建新会话。后续消息将进入新的 Pi 上下文。");
      return;
    }

    const conversation = this.sessions.getActiveConversation(chatId) ??
      this.createConversation(chatId, "Assistant");

    if (command === "/status") {
      const active = this.jobs.getLatestActive(conversation.id);
      const queued = this.queues.get(conversation.id)?.length ?? 0;
      const status = active
        ? "当前任务：" + active.status + "（" + active.id.slice(0, 8) + "）"
        : "当前没有正在执行的任务。";
      await this.reply(message, status + (queued ? "\n排队任务：" + queued : "") + "\n会话：" + conversation.title);
      return;
    }
    if (command === "/stop") {
      const stopped = await this.stopConversation(conversation.id);
      await this.reply(message, stopped
        ? "已请求停止当前任务，并清空该会话的等待队列。"
        : "当前会话没有正在执行或排队的任务。");
      return;
    }

    const job = this.jobs.create(conversation.id, message.text.trim());
    const task: QueuedTask = { jobId: job.id, conversation, message, cancelled: false };
    const queue = this.queues.get(conversation.id) ?? [];
    queue.push(task);
    this.queues.set(conversation.id, queue);
    const hasActive = this.active.has(conversation.id);
    const waitingAhead = hasActive ? queue.length : Math.max(0, queue.length - 1);
    await this.reply(message, "已收到，正在处理。" + (waitingAhead > 0 ? "前面还有 " + waitingAhead + " 个任务。" : ""));
    this.scheduleDrain(conversation.id);
  }

  private createConversation(chatId: string, title: string): ConversationRecord {
    const workspacePath = resolve(this.config.workspaces.defaultPath);
    const roots = this.config.security.workspaceRoots.map(root => resolve(root));
    if (!roots.some(root => isWithin(root, workspacePath))) {
      throw new Error("Default workspace is outside the configured workspace roots");
    }
    return this.sessions.createConversation({
      chatId,
      title,
      workspaceId: this.config.workspaces.defaultId,
      workspacePath,
      piSessionDir: resolve(this.config.pi.sessionDir)
    });
  }

  private async reply(message: IncomingMessage, text: string): Promise<void> {
    for (const part of splitText(text)) {
      try {
        await this.sendReply({
          peerId: this.ownerUserId,
          contextToken: message.contextToken,
          text: part
        });
      } catch (error) {
        console.error("[PiLink] failed to send WeChat reply:", error instanceof Error ? error.message : String(error));
      }
    }
  }

  private scheduleDrain(conversationId: string): void {
    if (this.drains.has(conversationId)) return;
    const running = this.drain(conversationId).finally(() => {
      if (this.drains.get(conversationId) === running) this.drains.delete(conversationId);
      if (!this.stopping && (this.queues.get(conversationId)?.length ?? 0) > 0) {
        this.scheduleDrain(conversationId);
      }
    });
    this.drains.set(conversationId, running);
  }

  private async drain(conversationId: string): Promise<void> {
    while (!this.stopping) {
      const queue = this.queues.get(conversationId);
      const task = queue?.shift();
      if (!task) {
        if (queue?.length === 0) this.queues.delete(conversationId);
        return;
      }
      if (task.cancelled) continue;

      const active: ActiveTask = { task };
      this.active.set(conversationId, active);
      try {
        const worker = await this.workers.getOrStart({
          sessionId: task.conversation.piSessionId,
          sessionDir: task.conversation.piSessionDir,
          cwd: task.conversation.workspacePath,
          name: task.conversation.title
        });
        active.worker = worker;
        if (task.cancelled || this.stopping) {
          this.jobs.cancel(task.jobId);
          continue;
        }
        this.jobs.markRunning(task.jobId);
        const result = await worker.promptAndWait(task.message.text, this.config.pi.rpcTimeoutMs);
        if (task.cancelled || this.stopping) {
          this.jobs.cancel(task.jobId);
          continue;
        }
        this.jobs.complete(task.jobId);
        const text = result.text.trim() || (await worker.getLastAssistantText())?.trim() || "任务已完成，但 Agent 没有返回文本。";
        await this.reply(task.message, text);
      } catch (error) {
        if (task.cancelled || this.stopping) {
          this.jobs.cancel(task.jobId);
        } else {
          const detail = error instanceof Error ? error.message : String(error);
          this.jobs.fail(task.jobId, detail);
          await this.reply(task.message, "执行失败：" + detail);
        }
      } finally {
        this.active.delete(conversationId);
      }
    }
  }

  private async stopConversation(conversationId: string): Promise<boolean> {
    const queued = this.queues.get(conversationId) ?? [];
    let stopped = queued.length > 0;
    for (const task of queued) {
      task.cancelled = true;
      this.jobs.cancel(task.jobId);
    }
    this.queues.set(conversationId, []);

    const active = this.active.get(conversationId);
    if (active) {
      stopped = true;
      active.task.cancelled = true;
      this.jobs.cancel(active.task.jobId);
      await active.worker?.abort().catch(error => {
        console.error("[PiLink] failed to abort Pi task:", error instanceof Error ? error.message : String(error));
      });
    }
    return stopped;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const conversationId of new Set([...this.queues.keys(), ...this.active.keys()])) {
      await this.stopConversation(conversationId);
    }
    await Promise.allSettled([...this.drains.values()]);
  }
}
