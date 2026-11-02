import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, resolvePiCliPath } from "./config.js";
import { createLogger } from "./logger.js";
import { openDatabase } from "./storage/database.js";
import { PiRpcWorker } from "./pi/rpc-worker.js";

function printUsage(): void {
  console.log("PiLink commands:");
  console.log("  doctor       Check local prerequisites and configuration");
  console.log("  pi:smoke     Run a local prompt through Pi RPC");
  console.log("  start        Initialize the local runtime skeleton");
}

async function doctor(): Promise<number> {
  const config = loadConfig();
  const logger = createLogger(config);
  let failures = 0;
  const nodeVersion = process.versions.node.split(".").map(Number);
  const nodeOk = nodeVersion[0] > 22 || (nodeVersion[0] === 22 && nodeVersion[1] >= 19);
  console.log((nodeOk ? "OK   " : "FAIL ") + "Node.js " + process.versions.node + " (requires >=22.19)");
  if (!nodeOk) failures += 1;

  try {
    console.log("OK   Pi CLI: " + resolvePiCliPath(config));
  } catch (error) {
    console.log("FAIL Pi CLI: " + (error instanceof Error ? error.message : String(error)));
    failures += 1;
  }

  const agentDirExists = existsSync(resolve(config.pi.agentDir));
  console.log((agentDirExists ? "OK   " : "WARN ") + "Pi agent directory: " + resolve(config.pi.agentDir));
  if (!agentDirExists) logger.warn("Pi agent directory does not exist yet; configure Pi and a model before the smoke test.");

  const workspace = resolve(config.workspaces.defaultPath);
  mkdirSync(workspace, { recursive: true });
  console.log("OK   Default workspace: " + workspace);

  const database = openDatabase(config.storage.databasePath);
  database.close();
  console.log("OK   SQLite: " + resolve(config.storage.databasePath));
  console.log((config.web.braveApiKey ? "OK   " : "WARN ") + "Brave Search API key " + (config.web.braveApiKey ? "configured" : "not configured"));
  console.log((config.security.allowedWechatUserIds.length > 0 ? "OK   " : "WARN ") + "WeChat sender allowlist " + config.security.allowedWechatUserIds.length + " entr(y/ies)");
  console.log("INFO WeChat transport is an interface-only scaffold in this milestone.");
  return failures === 0 ? 0 : 1;
}

async function piSmoke(prompt: string): Promise<void> {
  const config = loadConfig();
  const sessionId = "smoke_" + Date.now().toString(36);
  const worker = new PiRpcWorker({
    sessionId,
    sessionDir: resolve(config.pi.sessionDir),
    cwd: process.cwd(),
    name: "PiLink RPC smoke test",
    config
  });

  worker.onEvent((event) => {
    const value = event as unknown as {
      type?: string;
      toolName?: string;
      assistantMessageEvent?: { type?: string; delta?: string };
    };
    if (value.type === "message_update" && value.assistantMessageEvent?.type === "text_delta") {
      process.stdout.write(value.assistantMessageEvent.delta ?? "");
    } else if (value.type === "tool_execution_start") {
      process.stderr.write("\n[tool] " + (value.toolName ?? "unknown") + "\n");
    }
  });

  try {
    await worker.start();
    console.log("Pi RPC started. Sending prompt...");
    await worker.promptAndWait(prompt);
    process.stdout.write("\n");
    console.log("Pi RPC smoke test completed.");
  } finally {
    await worker.stop();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (command === "doctor") {
    const exitCode = await doctor();
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }
  if (command === "pi:smoke") {
    const prompt = process.argv.slice(3).join(" ") || "Reply briefly: PiLink can communicate with Pi over RPC.";
    await piSmoke(prompt);
    return;
  }
  if (command === "start") {
    const config = loadConfig();
    const logger = createLogger(config);
    const database = openDatabase(config.storage.databasePath);
    database.close();
    logger.info("PiLink foundation initialized.");
    logger.warn("No WeChat transport is enabled yet. Run 'npm run dev -- pi:smoke' to verify Pi RPC.");
    return;
  }
  printUsage();
  throw new Error("Unknown command: " + command);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
