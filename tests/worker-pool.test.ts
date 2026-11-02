import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { PiWorkerPool } from "../src/pi/worker-pool.js";

class FakeWorker {
  stopped = false;

  constructor(private readonly onStart: () => Promise<void> = async () => undefined) {}

  async start(): Promise<void> {
    await this.onStart();
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}

const descriptor = {
  sessionId: "session-1",
  sessionDir: "/tmp/pilink/sessions",
  cwd: "/tmp/pilink/workspace",
  name: "Test"
};

describe("PiWorkerPool", () => {
  it("shares one worker when the same session starts concurrently", async () => {
    const config = parseConfig({}, {});
    let releaseStart!: () => void;
    const gate = new Promise<void>((resolve) => { releaseStart = resolve; });
    const created: FakeWorker[] = [];
    const pool = new PiWorkerPool(config, () => {
      const worker = new FakeWorker(() => gate);
      created.push(worker);
      return worker;
    });

    const first = pool.getOrStart(descriptor);
    const second = pool.getOrStart(descriptor);
    expect(created).toHaveLength(1);

    releaseStart();
    const [firstWorker, secondWorker] = await Promise.all([first, second]);
    expect(firstWorker).toBe(secondWorker);
    expect(pool.size).toBe(1);
  });

  it("waits for a pending start before stopping the worker", async () => {
    const config = parseConfig({}, {});
    let releaseStart!: () => void;
    const gate = new Promise<void>((resolve) => { releaseStart = resolve; });
    const worker = new FakeWorker(() => gate);
    const pool = new PiWorkerPool(config, () => worker);

    const starting = pool.getOrStart(descriptor);
    const stopping = pool.stop(descriptor.sessionId);
    releaseStart();
    await Promise.all([starting, stopping]);

    expect(worker.stopped).toBe(true);
    expect(pool.size).toBe(0);
  });

  it("waits for pending workers and rejects new starts during shutdown", async () => {
    const config = parseConfig({}, {});
    let releaseStart!: () => void;
    const gate = new Promise<void>((resolve) => { releaseStart = resolve; });
    const worker = new FakeWorker(() => gate);
    const pool = new PiWorkerPool(config, () => worker);

    const starting = pool.getOrStart(descriptor);
    const stopping = pool.stopAll();
    await expect(pool.getOrStart({ ...descriptor, sessionId: "session-2" })).rejects.toThrow(/stopping/);
    releaseStart();
    await Promise.all([starting, stopping]);

    expect(worker.stopped).toBe(true);
    expect(pool.size).toBe(0);
    await expect(pool.stopAll()).resolves.toBeUndefined();
  });

  it("clears a failed start so a later attempt can succeed", async () => {
    const config = parseConfig({}, {});
    let attempts = 0;
    const workers: FakeWorker[] = [];
    const pool = new PiWorkerPool(config, () => {
      const worker = new FakeWorker(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("startup failed");
      });
      workers.push(worker);
      return worker;
    });

    await expect(pool.getOrStart(descriptor)).rejects.toThrow("startup failed");
    const recovered = await pool.getOrStart(descriptor);
    expect(recovered).toBe(workers[1]);
    expect(pool.size).toBe(1);
  });
});
