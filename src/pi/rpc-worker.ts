import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import type { AppConfig } from "../config.js";
import { resolvePiCliPath, resolveProjectPath } from "../config.js";

export type PiEvent = Parameters<RpcClient["onEvent"]>[0] extends (event: infer T) => void ? T : never;

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
    if (this.started) return;
    await mkdir(resolve(this.options.cwd), { recursive: true });
    await mkdir(resolve(this.options.sessionDir), { recursive: true });
    await this.client.start();
    this.started = true;
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
      if (!this.started) await this.start();
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

  async getState(): Promise<unknown> {
    if (!this.started) throw new Error("Pi RPC worker is not running");
    return this.client.getState();
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
    if (!this.started) return;
    await this.client.stop();
    this.started = false;
  }
}
