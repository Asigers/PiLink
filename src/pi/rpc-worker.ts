import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import type { AppConfig } from "../config.js";
import { resolvePiCliPath, resolveProjectPath } from "../config.js";

export type PiEvent = Parameters<RpcClient["onEvent"]>[0] extends (event: infer T) => void ? T : never;
export type PiSessionState = Awaited<ReturnType<RpcClient["getState"]>>;

export interface PiWorkerOptions {
  sessionId: string;
  sessionDir: string;
  cwd: string;
  name: string;
  config: AppConfig;
}

export interface PromptResult {
  events: PiEvent[];
  text: string;
}

function eventText(event: PiEvent): string {
  const value = event as unknown as {
    type?: string;
    assistantMessageEvent?: { type?: string; delta?: string };
  };
  if (value.type === "message_update" && value.assistantMessageEvent?.type === "text_delta") {
    return value.assistantMessageEvent.delta ?? "";
  }
  return "";
}

export class PiRpcWorker {
  private readonly client: RpcClient;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private promptTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: PiWorkerOptions) {
    const args = [
      "--session-dir", resolve(options.sessionDir),
      "--session-id", options.sessionId,
      "--name", options.name,
      "--append-system-prompt", resolveProjectPath(options.config.pi.systemPromptPath)
    ];
    for (const extension of options.config.pi.extensions) args.push("--extension", resolveProjectPath(extension));
    for (const skill of options.config.pi.skills) args.push("--skill", resolveProjectPath(skill));

    this.client = new RpcClient({
      cliPath: resolvePiCliPath(options.config),
      cwd: resolve(options.cwd),
      args,
      env: {
        PI_CODING_AGENT_DIR: resolve(options.config.pi.agentDir),
        BRAVE_SEARCH_API_KEY: options.config.web.braveApiKey ?? ""
      }
    });
  }

  async start(): Promise<void> {
    if (this.stopPromise) await this.stopPromise;
    if (this.started) return;
    if (this.startPromise) return this.startPromise;

    const starting = (async () => {
      await mkdir(resolve(this.options.cwd), { recursive: true });
      await mkdir(resolve(this.options.sessionDir), { recursive: true });
      try {
        await this.client.start();
        this.started = true;
      } catch (error) {
        await this.client.stop().catch(() => undefined);
        throw error;
      }
    })();

    this.startPromise = starting;
    try {
      await starting;
    } finally {
      if (this.startPromise === starting) this.startPromise = null;
    }
  }

  onEvent(listener: (event: PiEvent) => void): () => void {
    return this.client.onEvent(listener);
  }

  promptAndWait(
    message: string,
    timeoutMs = this.options.config.pi.rpcTimeoutMs,
    onStart?: () => void
  ): Promise<PromptResult> {
    const operation = this.promptTail.then(async () => {
      await this.start();
      onStart?.();
      const events = await this.client.promptAndWait(message, undefined, timeoutMs);
      return { events, text: events.map(eventText).join("") };
    });
    this.promptTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async steer(message: string): Promise<void> {
    if (!this.started) throw new Error("Pi RPC worker is not running");
    await this.client.steer(message);
  }

  async followUp(message: string): Promise<void> {
    if (!this.started) throw new Error("Pi RPC worker is not running");
    await this.client.followUp(message);
  }

  async abort(): Promise<void> {
    if (this.started) await this.client.abort();
  }

  async getState(): Promise<PiSessionState> {
    if (!this.started) throw new Error("Pi RPC worker is not running");
    return this.client.getState();
  }

  async getLastAssistantText(): Promise<string | null> {
    if (!this.started) throw new Error("Pi RPC worker is not running");
    return this.client.getLastAssistantText();
  }

  async getSessionStats(): Promise<unknown> {
    if (!this.started) throw new Error("Pi RPC worker is not running");
    return this.client.getSessionStats();
  }

  async compact(instructions?: string): Promise<unknown> {
    if (!this.started) throw new Error("Pi RPC worker is not running");
    return this.client.compact(instructions);
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;

    const stopping = (async () => {
      if (this.startPromise) await this.startPromise.catch(() => undefined);
      if (!this.started) return;
      await this.client.stop();
      this.started = false;
    })();

    this.stopPromise = stopping;
    try {
      await stopping;
    } finally {
      if (this.stopPromise === stopping) this.stopPromise = null;
    }
  }
}
