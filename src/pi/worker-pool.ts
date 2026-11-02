import type { AppConfig } from "../config.js";
import { PiRpcWorker, type PiWorkerOptions } from "./rpc-worker.js";

export interface WorkerDescriptor {
  sessionId: string;
  sessionDir: string;
  cwd: string;
  name: string;
}

export interface PiWorkerLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type PiWorkerFactory<TWorker extends PiWorkerLifecycle> = (options: PiWorkerOptions) => TWorker;

export class PiWorkerPool<TWorker extends PiWorkerLifecycle = PiRpcWorker> {
  private readonly workers = new Map<string, TWorker>();
  private readonly starting = new Map<string, Promise<TWorker>>();
  private readonly createWorker: PiWorkerFactory<TWorker>;
  private stopping = false;
  private stopAllPromise: Promise<void> | null = null;

  constructor(
    private readonly config: AppConfig,
    createWorker?: PiWorkerFactory<TWorker>
  ) {
    this.createWorker = createWorker ?? ((options) => new PiRpcWorker(options) as TWorker);
  }

  async getOrStart(descriptor: WorkerDescriptor): Promise<TWorker> {
    if (this.stopping) throw new Error("Pi worker pool is stopping");

    const existing = this.workers.get(descriptor.sessionId);
    if (existing) return existing;
    const pending = this.starting.get(descriptor.sessionId);
    if (pending) return pending;

    const worker = this.createWorker({ ...descriptor, config: this.config });
    const startPromise = worker.start()
      .then(() => {
        this.workers.set(descriptor.sessionId, worker);
        return worker;
      })
      .finally(() => this.starting.delete(descriptor.sessionId));

    this.starting.set(descriptor.sessionId, startPromise);
    return startPromise;
  }

  get(sessionId: string): TWorker | undefined {
    return this.workers.get(sessionId);
  }

  async stop(sessionId: string): Promise<void> {
    const pending = this.starting.get(sessionId);
    if (pending) {
      try {
        await pending;
      } catch {
        return;
      }
    }

    const worker = this.workers.get(sessionId);
    if (!worker) return;
    this.workers.delete(sessionId);
    await worker.stop();
  }

  stopAll(): Promise<void> {
    if (this.stopAllPromise) return this.stopAllPromise;
    this.stopping = true;

    this.stopAllPromise = (async () => {
      await Promise.allSettled([...this.starting.values()]);
      const workers = [...this.workers.values()];
      this.workers.clear();
      await Promise.allSettled(workers.map((worker) => worker.stop()));
    })();

    return this.stopAllPromise;
  }

  get size(): number {
    return this.workers.size;
  }
}
