import type { AppConfig } from "../config.js";
import { PiRpcWorker } from "./rpc-worker.js";

export interface WorkerDescriptor {
  sessionId: string;
  sessionDir: string;
  cwd: string;
  name: string;
}

export class PiWorkerPool {
  private readonly workers = new Map<string, PiRpcWorker>();
  private readonly starting = new Map<string, Promise<PiRpcWorker>>();

  constructor(private readonly config: AppConfig) {}

  async getOrStart(descriptor: WorkerDescriptor): Promise<PiRpcWorker> {
    const existing = this.workers.get(descriptor.sessionId);
    if (existing) return existing;
    const pending = this.starting.get(descriptor.sessionId);
    if (pending) return pending;

    const worker = new PiRpcWorker({ ...descriptor, config: this.config });
    const startPromise = worker.start()
      .then(() => {
        this.workers.set(descriptor.sessionId, worker);
        return worker;
      })
      .finally(() => this.starting.delete(descriptor.sessionId));

    this.starting.set(descriptor.sessionId, startPromise);
    return startPromise;
  }

  get(sessionId: string): PiRpcWorker | undefined {
    return this.workers.get(sessionId);
  }

  async stop(sessionId: string): Promise<void> {
    const worker = this.workers.get(sessionId);
    if (!worker) return;
    this.workers.delete(sessionId);
    await worker.stop();
  }

  async stopAll(): Promise<void> {
    const workers = [...this.workers.values()];
    this.workers.clear();
    await Promise.allSettled(workers.map((worker) => worker.stop()));
  }

  get size(): number {
    return this.workers.size;
  }
}
